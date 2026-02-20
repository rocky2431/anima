import type { ActivityType, ContextSource, ExtractedEntities, MergedContext } from '../processing/types'
import type { LlmProvider } from '../types'

import { describe, expect, it } from 'vitest'

import { ContextMerger } from '../processing/context-merger'

// Test Double rationale: LLM is an external API boundary (cloud AI service).
// We verify the merging/orchestration logic, not the LLM itself.
class StubLlmProvider implements LlmProvider {
  public generateTextCalls: Array<{ system: string, prompt: string }> = []
  public generateStructuredCalls: Array<{ system: string, prompt: string, schemaDescription: string }> = []

  private summaryResponse = 'User is writing TypeScript code in VS Code while browsing documentation.'
  private entityResponse: ExtractedEntities = {
    persons: ['Alice'],
    organizations: ['Anthropic'],
    locations: [],
    technologies: ['TypeScript', 'VS Code'],
    concepts: ['code review'],
  }

  private activityResponse: { activityType: ActivityType } = { activityType: 'coding' }

  constructor(overrides?: {
    summary?: string
    entities?: ExtractedEntities
    activityType?: ActivityType
  }) {
    if (overrides?.summary)
      this.summaryResponse = overrides.summary
    if (overrides?.entities)
      this.entityResponse = overrides.entities
    if (overrides?.activityType)
      this.activityResponse = { activityType: overrides.activityType }
  }

  async generateText(options: { system: string, prompt: string }): Promise<string> {
    this.generateTextCalls.push(options)
    return this.summaryResponse
  }

  async generateStructured<T>(options: {
    system: string
    prompt: string
    schemaDescription: string
  }): Promise<T> {
    this.generateStructuredCalls.push(options)
    // Route by schema: entity extraction or activity classification
    if (options.schemaDescription.includes('persons')) {
      return this.entityResponse as T
    }
    return this.activityResponse as T
  }
}

function makeSource(overrides: Partial<ContextSource> & { source: ContextSource['source'] }): ContextSource {
  return {
    summary: 'default summary',
    entities: [],
    keywords: [],
    timestamp: Date.now(),
    importance: 0.5,
    ...overrides,
  }
}

describe('contextMerger', () => {
  describe('merge', () => {
    it('merges multiple sources into a MergedContext', async () => {
      const llm = new StubLlmProvider()
      const merger = new ContextMerger({ llm })

      const sources: ContextSource[] = [
        makeSource({
          source: 'screenshot',
          summary: 'User is writing TypeScript code in VS Code',
          entities: ['VS Code', 'TypeScript'],
          keywords: ['typescript', 'code'],
          importance: 0.8,
        }),
        makeSource({
          source: 'activity',
          summary: 'Active in VS Code for 45 minutes',
          entities: ['VS Code'],
          keywords: ['vs code', 'development'],
          importance: 0.6,
        }),
      ]

      const result = await merger.merge(sources)

      expect(result).toMatchObject({
        summary: expect.any(String),
        keywords: expect.any(Array),
        entities: expect.any(Array),
        extractedEntities: expect.objectContaining({
          persons: expect.any(Array),
          organizations: expect.any(Array),
          locations: expect.any(Array),
          technologies: expect.any(Array),
          concepts: expect.any(Array),
        }),
        importance: expect.any(Number),
        activityType: expect.any(String),
        sourceCount: 2,
        timestamp: expect.any(Number),
      } satisfies Record<keyof MergedContext, unknown>)
    })

    it('deduplicates entities across sources (case-insensitive)', async () => {
      const llm = new StubLlmProvider()
      const merger = new ContextMerger({ llm })

      const sources: ContextSource[] = [
        makeSource({
          source: 'screenshot',
          entities: ['VS Code', 'TypeScript', 'terminal'],
        }),
        makeSource({
          source: 'activity',
          entities: ['vs code', 'typescript', 'Chrome'],
        }),
        makeSource({
          source: 'document',
          entities: ['Terminal', 'React'],
        }),
      ]

      const result = await merger.merge(sources)

      // Should be deduplicated case-insensitively, preserving first occurrence's casing
      const lowered = result.entities.map(e => e.toLowerCase())
      const unique = [...new Set(lowered)]
      expect(lowered).toEqual(unique)
      expect(result.entities).toHaveLength(5) // VS Code, TypeScript, terminal, Chrome, React
    })

    it('deduplicates keywords across sources (case-insensitive)', async () => {
      const llm = new StubLlmProvider()
      const merger = new ContextMerger({ llm })

      const sources: ContextSource[] = [
        makeSource({
          source: 'screenshot',
          keywords: ['TypeScript', 'coding', 'frontend'],
        }),
        makeSource({
          source: 'activity',
          keywords: ['typescript', 'Coding', 'development'],
        }),
      ]

      const result = await merger.merge(sources)

      const lowered = result.keywords.map(k => k.toLowerCase())
      const unique = [...new Set(lowered)]
      expect(lowered).toEqual(unique)
      expect(result.keywords).toHaveLength(4) // TypeScript, coding, frontend, development
    })

    it('computes importance as arithmetic mean of source importances', async () => {
      const llm = new StubLlmProvider()
      const merger = new ContextMerger({ llm })

      const sources: ContextSource[] = [
        makeSource({ source: 'screenshot', importance: 0.9 }),
        makeSource({ source: 'activity', importance: 0.3 }),
      ]

      const result = await merger.merge(sources)

      // Importance should be between 0 and 1
      expect(result.importance).toBeGreaterThanOrEqual(0)
      expect(result.importance).toBeLessThanOrEqual(1)
      // Average of 0.9 and 0.3 = 0.6
      expect(result.importance).toBeCloseTo(0.6, 1)
    })

    it('defaults source importance to 0.5 when omitted', async () => {
      const llm = new StubLlmProvider()
      const merger = new ContextMerger({ llm })

      const sources: ContextSource[] = [
        makeSource({ source: 'screenshot', importance: undefined }),
        makeSource({ source: 'activity', importance: undefined }),
      ]

      const result = await merger.merge(sources)
      expect(result.importance).toBeCloseTo(0.5, 1)
    })

    it('classifies activity type via LLM', async () => {
      const llm = new StubLlmProvider({ activityType: 'writing' })
      const merger = new ContextMerger({ llm })

      const sources: ContextSource[] = [
        makeSource({
          source: 'screenshot',
          summary: 'User is writing a document in Google Docs',
          keywords: ['writing', 'document'],
        }),
      ]

      const result = await merger.merge(sources)
      expect(result.activityType).toBe('writing')
    })

    it('returns all 7 valid activity types', async () => {
      const validTypes: ActivityType[] = [
        'coding',
        'writing',
        'browsing',
        'communication',
        'entertainment',
        'meeting',
        'other',
      ]

      for (const activityType of validTypes) {
        const llm = new StubLlmProvider({ activityType })
        const merger = new ContextMerger({ llm })
        const result = await merger.merge([makeSource({ source: 'activity' })])
        expect(result.activityType).toBe(activityType)
      }
    })

    it('generates summary via LLM from all source summaries', async () => {
      const expectedSummary = 'User is actively coding a TypeScript project in VS Code.'
      const llm = new StubLlmProvider({ summary: expectedSummary })
      const merger = new ContextMerger({ llm })

      const sources: ContextSource[] = [
        makeSource({
          source: 'screenshot',
          summary: 'VS Code with TypeScript file open',
        }),
        makeSource({
          source: 'activity',
          summary: 'Active in VS Code for 45 minutes',
        }),
      ]

      const result = await merger.merge(sources)
      expect(result.summary).toBe(expectedSummary)
      // Verify LLM was called with source summaries
      expect(llm.generateTextCalls).toHaveLength(1)
      expect(llm.generateTextCalls[0].prompt).toContain('VS Code with TypeScript file open')
      expect(llm.generateTextCalls[0].prompt).toContain('Active in VS Code for 45 minutes')
    })

    it('extracts structured entities via LLM', async () => {
      const entities: ExtractedEntities = {
        persons: ['Bob', 'Alice'],
        organizations: ['Google'],
        locations: ['San Francisco'],
        technologies: ['React', 'Node.js'],
        concepts: ['microservices'],
      }
      const llm = new StubLlmProvider({ entities })
      const merger = new ContextMerger({ llm })

      const result = await merger.merge([
        makeSource({
          source: 'document',
          summary: 'Meeting notes about microservices migration at Google SF office',
        }),
      ])

      expect(result.extractedEntities).toEqual(entities)
    })

    it('handles single source correctly', async () => {
      const llm = new StubLlmProvider()
      const merger = new ContextMerger({ llm })

      const result = await merger.merge([
        makeSource({
          source: 'screenshot',
          summary: 'User browsing web',
          entities: ['Chrome'],
          keywords: ['web'],
          importance: 0.7,
        }),
      ])

      expect(result.sourceCount).toBe(1)
      expect(result.entities).toContain('Chrome')
      expect(result.keywords).toContain('web')
      expect(result.importance).toBeCloseTo(0.7, 1)
    })

    it('throws for empty sources array', async () => {
      const llm = new StubLlmProvider()
      const merger = new ContextMerger({ llm })

      await expect(merger.merge([])).rejects.toThrow('At least one context source is required')
    })

    it('respects maxSources limit', async () => {
      const llm = new StubLlmProvider()
      const merger = new ContextMerger({ llm, maxSources: 2 })

      const sources: ContextSource[] = [
        makeSource({ source: 'screenshot', timestamp: 3000, summary: 'newest screenshot' }),
        makeSource({ source: 'activity', timestamp: 1000, summary: 'oldest activity' }),
        makeSource({ source: 'document', timestamp: 2000, summary: 'middle document' }),
      ]

      const result = await merger.merge(sources)

      // Should keep the 2 most recent sources
      expect(result.sourceCount).toBe(2)
      // LLM summary call should contain only the 2 most recent
      expect(llm.generateTextCalls[0].prompt).toContain('newest screenshot')
      expect(llm.generateTextCalls[0].prompt).toContain('middle document')
      expect(llm.generateTextCalls[0].prompt).not.toContain('oldest activity')
    })

    it('wraps LLM errors with context', async () => {
      const failingLlm: LlmProvider = {
        async generateText(): Promise<string> {
          throw new Error('LLM service unavailable')
        },
        async generateStructured(): Promise<never> {
          throw new Error('LLM service unavailable')
        },
      }

      const merger = new ContextMerger({ llm: failingLlm })

      await expect(
        merger.merge([makeSource({ source: 'activity' })]),
      ).rejects.toSatisfy((error: Error) => {
        return error.message.startsWith('Context merge failed')
          && error.cause instanceof Error
      })
    })

    it('falls back to "other" for invalid activity type from LLM', async () => {
      const llm = new StubLlmProvider()
      // Override to return invalid activity type
      llm.generateStructured = async <T>(options: {
        system: string
        prompt: string
        schemaDescription: string
      }): Promise<T> => {
        if (options.schemaDescription.includes('persons')) {
          return { persons: [], organizations: [], locations: [], technologies: [], concepts: [] } as T
        }
        return { activityType: 'invalid_type_from_llm' } as T
      }
      const merger = new ContextMerger({ llm })

      const result = await merger.merge([makeSource({ source: 'activity' })])
      expect(result.activityType).toBe('other')
    })

    it('throws RangeError for maxSources < 1', () => {
      const llm = new StubLlmProvider()
      expect(() => new ContextMerger({ llm, maxSources: 0 })).toThrow(RangeError)
      expect(() => new ContextMerger({ llm, maxSources: -1 })).toThrow(RangeError)
    })
  })
})
