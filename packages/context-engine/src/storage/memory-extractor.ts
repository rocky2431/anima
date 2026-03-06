import type {
  EmbeddingProvider,
  ExtractedImportantDate,
  ExtractedMemoryItem,
  ExtractedProfileFact,
  ExtractedRelationship,
  ExtractionInput,
  ExtractionResult,
  LlmProvider,
  PersonaConfig,
} from '../types'

import { cosineSimilarity } from '../consumption/smart-todo'

export interface MemoryExtractorOptions {
  llm: LlmProvider
  embedding: EmbeddingProvider
  persona: PersonaConfig
  additionalSystemContext?: string
  /** Cosine similarity threshold for dedup against existing memories (default 0.85) */
  dedupThreshold?: number
  onExtraction?: (result: ExtractionResult) => void
  onError?: (error: Error) => void
}

function isValidMemoryItem(value: unknown): value is ExtractedMemoryItem {
  if (!value || typeof value !== 'object')
    return false
  const obj = value as Record<string, unknown>
  return (
    typeof obj.content === 'string'
    && typeof obj.importance === 'number'
    && typeof obj.category === 'string'
  )
}

function isValidProfileFact(value: unknown): value is ExtractedProfileFact {
  if (!value || typeof value !== 'object')
    return false
  const obj = value as Record<string, unknown>
  return typeof obj.fact === 'string' && typeof obj.confidence === 'number'
}

function isValidRelationship(value: unknown): value is ExtractedRelationship {
  if (!value || typeof value !== 'object')
    return false
  const obj = value as Record<string, unknown>
  return typeof obj.personName === 'string' && typeof obj.relationshipType === 'string'
}

function isValidImportantDate(value: unknown): value is ExtractedImportantDate {
  if (!value || typeof value !== 'object')
    return false
  const obj = value as Record<string, unknown>
  return (
    typeof obj.date === 'string'
    && typeof obj.dateType === 'string'
    && typeof obj.label === 'string'
  )
}

function validateExtractionResult(raw: unknown): ExtractionResult {
  if (!raw || typeof raw !== 'object') {
    return { memories: [], profileFacts: [], relationships: [], importantDates: [] }
  }
  const obj = raw as Record<string, unknown>
  return {
    memories: Array.isArray(obj.memories) ? obj.memories.filter(isValidMemoryItem) : [],
    profileFacts: Array.isArray(obj.profileFacts) ? obj.profileFacts.filter(isValidProfileFact) : [],
    relationships: Array.isArray(obj.relationships) ? obj.relationships.filter(isValidRelationship) : [],
    importantDates: Array.isArray(obj.importantDates)
      ? obj.importantDates.filter(isValidImportantDate).map((d) => {
          const rec = d as unknown as Record<string, unknown>
          return {
            date: rec.date as string,
            dateType: rec.dateType as string,
            label: rec.label as string,
            description: typeof rec.description === 'string' ? rec.description : '',
          }
        })
      : [],
  }
}

/**
 * Extracts structured memories from daily conversations via LLM.
 * Validates output, filters by importance threshold, and deduplicates
 * against existing memory embeddings.
 *
 * Flow: input → prompt → LLM generateStructured → validate → importance filter → embedding dedup → ExtractionResult
 */
export class MemoryExtractor {
  private readonly llm: LlmProvider
  private readonly embedding: EmbeddingProvider
  private readonly persona: PersonaConfig
  private readonly additionalSystemContext?: string
  private readonly dedupThreshold: number
  private readonly onExtraction?: (result: ExtractionResult) => void
  private readonly onError?: (error: Error) => void

  constructor(options: MemoryExtractorOptions) {
    this.llm = options.llm
    this.embedding = options.embedding
    this.persona = options.persona
    this.additionalSystemContext = options.additionalSystemContext
    this.dedupThreshold = options.dedupThreshold ?? 0.85
    this.onExtraction = options.onExtraction
    this.onError = options.onError
  }

  /**
   * Extract memories from conversation/activity context.
   *
   * @param input - Conversations, activities, and todos for the day.
   * @param existingMemoryEmbeddings - Embeddings of already-stored memories for dedup.
   * @returns Validated, filtered, deduplicated extraction result.
   */
  async extract(input: ExtractionInput, existingMemoryEmbeddings: number[][]): Promise<ExtractionResult> {
    try {
      const system = this.buildSystemPrompt()
      const prompt = this.buildUserPrompt(input)
      const schemaDescription = [
        'Return a JSON object with:',
        '- memories: Array<{content: string, importance: number (1-10), category: string}>',
        '- profileFacts: Array<{fact: string, confidence: number (0-1)}>',
        '- relationships: Array<{personName: string, relationshipType: string}>',
        '- importantDates: Array<{date: string (MM-DD or YYYY-MM-DD), dateType: string, label: string, description: string}>',
        '',
        'Only include memories with importance >= 7.',
        'Categories: preference, event, habit, goal, emotion',
      ].join('\n')

      const raw = await this.llm.generateStructured<ExtractionResult>({
        system,
        prompt,
        schemaDescription,
      })

      const validated = validateExtractionResult(raw)

      // Filter memories by importance threshold
      const importantMemories = validated.memories.filter(m => m.importance >= 7)

      // Deduplicate against existing memories
      const dedupedMemories = await this.dedup(importantMemories, existingMemoryEmbeddings)

      const result: ExtractionResult = {
        memories: dedupedMemories,
        profileFacts: validated.profileFacts,
        relationships: validated.relationships,
        importantDates: validated.importantDates,
      }

      this.onExtraction?.(result)
      return result
    }
    catch (cause) {
      const error = new Error(
        `MemoryExtractor failed (conversations=${input.conversations.length})`,
        { cause },
      )
      if (this.onError) {
        try { this.onError(error) }
        catch (_callbackErr) {
          // onError callback threw — error bound for debugger visibility.
          // Caller-provided callback is responsible for its own error handling.
        }
        return { memories: [], profileFacts: [], relationships: [], importantDates: [] }
      }
      throw error
    }
  }

  private async dedup(
    memories: ExtractedMemoryItem[],
    existingEmbeddings: number[][],
  ): Promise<ExtractedMemoryItem[]> {
    if (memories.length === 0 || existingEmbeddings.length === 0) {
      return memories
    }

    const result: ExtractedMemoryItem[] = []

    for (const memory of memories) {
      try {
        const vector = await this.embedding.embed(memory.content)

        const isDuplicate = existingEmbeddings.some(
          existing => cosineSimilarity(existing, vector) >= this.dedupThreshold,
        )

        if (!isDuplicate) {
          result.push(memory)
        }
      }
      catch (_embeddingErr) {
        // Embedding failed — include the memory rather than losing it.
        // Error bound for debugger visibility; onError not called to avoid
        // aborting the entire dedup loop for a per-item embedding failure.
        result.push(memory)
      }
    }

    return result
  }

  private buildSystemPrompt(): string {
    const lines = [
      `你是${this.persona.name}，一个虚拟 AI 角色。`,
      `性格: ${this.persona.personality}`,
      `说话风格: ${this.persona.speakingStyle}`,
      '',
      '你的任务是从今天的对话和活动中提取重要记忆。',
      '重要记忆包括: 用户偏好、重要事件、人际关系、重要日期。',
      '只提取 importance >= 7 的记忆。',
    ]
    if (this.additionalSystemContext) {
      lines.push('', this.additionalSystemContext)
    }
    return lines.join('\n')
  }

  private buildUserPrompt(input: ExtractionInput): string {
    const lines: string[] = []

    if (input.conversations.length > 0) {
      lines.push('今日对话:')
      for (const conv of input.conversations) {
        lines.push(`  [${conv.role}]: ${conv.content}`)
      }
      lines.push('')
    }

    if (input.activities.length > 0) {
      lines.push('今日活动:')
      for (const act of input.activities) {
        lines.push(`  - ${act.app}: ${act.description}`)
      }
      lines.push('')
    }

    if (input.todos.length > 0) {
      lines.push('当前待办:')
      for (const todo of input.todos) {
        const status = todo.completed ? '[已完成]' : '[待办]'
        lines.push(`  ${status} ${todo.title}`)
      }
      lines.push('')
    }

    lines.push('请提取重要记忆、用户画像、人际关系和重要日期。')

    return lines.join('\n')
  }
}
