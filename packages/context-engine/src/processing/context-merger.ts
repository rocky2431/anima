import type { LlmProvider } from '../types'
import type { ActivityType, ContextSource, MergedContext } from './types'

import { EntityExtractor } from './entity-extractor'

export interface ContextMergerOptions {
  /** LLM provider for summary generation, entity extraction, and activity classification */
  llm: LlmProvider
  /** Maximum sources to merge in a single call (default: 10). Must be >= 1. */
  maxSources?: number
}

const DEFAULT_MAX_SOURCES = 10
const DEFAULT_IMPORTANCE = 0.5

const VALID_ACTIVITY_TYPES: ReadonlySet<ActivityType> = new Set<ActivityType>([
  'coding',
  'writing',
  'browsing',
  'communication',
  'entertainment',
  'meeting',
  'other',
])

const SUMMARY_SYSTEM_PROMPT = `You are a context summarizer. Given multiple context descriptions from different sources (screenshots, activity tracking, documents, etc.), produce a single concise summary (1-2 sentences) that describes what the user is currently doing. Focus on the most relevant and recent activity.`

const ACTIVITY_CLASSIFICATION_SCHEMA = '{ activityType: "coding" | "writing" | "browsing" | "communication" | "entertainment" | "meeting" | "other" }'

const ACTIVITY_SYSTEM_PROMPT = `Classify the user's current activity into exactly one of these types based on the provided context:
- coding: Writing or reviewing code, using IDEs, terminals, debugging
- writing: Creating documents, notes, articles, emails
- browsing: Web browsing, reading articles, searching
- communication: Chat, video calls, messaging, social media
- entertainment: Games, videos, music, streaming
- meeting: Video conferences, scheduled meetings, presentations
- other: Any activity that doesn't fit the above categories

Return ONLY the JSON object with the activityType field.`

// --- Pure functions (Functional Core) ---

/**
 * Deduplicates strings case-insensitively, preserving the casing of the first occurrence.
 * Also trims whitespace before comparison.
 */
export function deduplicateStrings(items: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const item of items) {
    const normalized = item.trim().toLowerCase()
    if (normalized.length === 0)
      continue
    if (seen.has(normalized))
      continue
    seen.add(normalized)
    result.push(item.trim())
  }

  return result
}

/**
 * Merges keywords from multiple context sources, deduplicating case-insensitively.
 */
export function mergeKeywords(sources: readonly ContextSource[]): string[] {
  const allKeywords = sources.flatMap(s => s.keywords)
  return deduplicateStrings(allKeywords)
}

/**
 * Computes importance as the arithmetic mean of all source importance values.
 * Sources without an importance value default to 0.5.
 * Returns 0.5 for empty input.
 */
export function computeImportance(sources: readonly ContextSource[]): number {
  if (sources.length === 0)
    return DEFAULT_IMPORTANCE

  const sum = sources.reduce(
    (acc, s) => acc + (s.importance ?? DEFAULT_IMPORTANCE),
    0,
  )
  return Math.max(0, Math.min(1, sum / sources.length))
}

/**
 * Selects the top N most recent sources by timestamp.
 */
export function selectTopSources(sources: readonly ContextSource[], limit: number): ContextSource[] {
  if (sources.length <= limit)
    return [...sources]

  return [...sources]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit)
}

/**
 * Builds a combined text representation from multiple sources.
 */
function buildCombinedText(sources: readonly ContextSource[]): string {
  return sources
    .map(s => `[${s.source}] ${s.summary}`)
    .join('\n')
}

// --- ContextMerger (Imperative Shell) ---

/**
 * Merges multiple context sources into a unified MergedContext.
 *
 * Pipeline:
 * 1. Select top sources by recency (respecting maxSources)
 * 2. Deduplicate entities and keywords (pure)
 * 3. Compute importance score (pure)
 * 4. Extract structured entities via LLM
 * 5. Classify activity type via LLM
 * 6. Generate unified summary via LLM
 */
export class ContextMerger {
  private readonly entityExtractor: EntityExtractor
  private readonly llm: LlmProvider
  private readonly maxSources: number

  constructor(options: ContextMergerOptions) {
    const maxSources = options.maxSources ?? DEFAULT_MAX_SOURCES
    if (maxSources < 1) {
      throw new RangeError('maxSources must be >= 1')
    }
    this.llm = options.llm
    this.entityExtractor = new EntityExtractor(options.llm)
    this.maxSources = maxSources
  }

  async merge(sources: readonly ContextSource[]): Promise<MergedContext> {
    if (sources.length === 0) {
      throw new Error('At least one context source is required')
    }

    try {
      const selected = selectTopSources(sources, this.maxSources)
      const entities = deduplicateStrings(selected.flatMap(s => s.entities))
      const keywords = mergeKeywords(selected)
      const importance = computeImportance(selected)
      const combinedText = buildCombinedText(selected)

      const [extractedEntities, activityClassification, summary] = await Promise.all([
        this.entityExtractor.extract(combinedText),
        this.classifyActivity(combinedText),
        this.generateSummary(combinedText),
      ])

      return {
        summary,
        keywords,
        entities,
        extractedEntities,
        importance,
        activityType: this.validateActivityType(activityClassification),
        sourceCount: selected.length,
        timestamp: Date.now(),
      }
    }
    catch (cause) {
      const sourceTypes = sources.map(s => s.source).join(',')
      throw new Error(`Context merge failed (${sources.length} sources, types=[${sourceTypes}])`, { cause })
    }
  }

  private async classifyActivity(combinedText: string): Promise<string> {
    const result = await this.llm.generateStructured<unknown>({
      system: ACTIVITY_SYSTEM_PROMPT,
      prompt: combinedText,
      schemaDescription: ACTIVITY_CLASSIFICATION_SCHEMA,
    })
    if (result != null && typeof result === 'object' && 'activityType' in result && typeof (result as Record<string, unknown>).activityType === 'string') {
      return (result as Record<string, unknown>).activityType as string
    }
    return 'other'
  }

  private async generateSummary(combinedText: string): Promise<string> {
    return this.llm.generateText({
      system: SUMMARY_SYSTEM_PROMPT,
      prompt: combinedText,
    })
  }

  private validateActivityType(type: string): ActivityType {
    if (VALID_ACTIVITY_TYPES.has(type as ActivityType)) {
      return type as ActivityType
    }
    // Unrecognized LLM output falls back to 'other' silently.
    // Structured logging can be added when a logger is wired into this package.
    return 'other'
  }
}
