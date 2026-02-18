import type { Todo } from '../storage/types'
import type {
  EmbeddingProvider,
  LlmProvider,
  PersonaConfig,
  ProcessedContext,
  SmartTodoResult,
  TodoSuggestion,
} from '../types'

export interface SmartTodoOptions {
  llm: LlmProvider
  embedding: EmbeddingProvider
  persona: PersonaConfig
  /** Cosine similarity threshold for dedup (0-1, default 0.95) */
  similarityThreshold?: number
  /** Maximum number of recent embeddings to keep for dedup (default 200) */
  maxHistorySize?: number
  onTodo?: (result: SmartTodoResult) => void
  onError?: (error: Error) => void
}

const DEFAULT_MAX_HISTORY_SIZE = 200

/**
 * Compute the cosine similarity between two vectors.
 * Returns 0 for empty, mismatched-length, or zero-magnitude vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0)
    return 0
  let dotProduct = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB)
  if (denominator === 0)
    return 0
  return dotProduct / denominator
}

function isValidTodoSuggestion(value: unknown): value is TodoSuggestion {
  if (!value || typeof value !== 'object')
    return false
  const obj = value as Record<string, unknown>
  return typeof obj.title === 'string' && typeof obj.reason === 'string'
}

function validateSuggestions(raw: unknown): TodoSuggestion[] {
  if (!raw || typeof raw !== 'object')
    return []
  const obj = raw as Record<string, unknown>
  if (!Array.isArray(obj.suggestions))
    return []
  return obj.suggestions.filter(isValidTodoSuggestion)
}

/**
 * Extracts smart todo suggestions from user context.
 * Designed to run periodically via cron-service.
 * Supports vector-based dedup to avoid repeating similar suggestions.
 *
 * Flow: context → prompt → LLM generateStructured → validation → embedding dedup → SmartTodoResult
 */
export class SmartTodo {
  private llm: LlmProvider
  private readonly embedding: EmbeddingProvider
  private readonly persona: PersonaConfig
  private readonly similarityThreshold: number
  private readonly maxHistorySize: number
  private readonly onTodo?: (result: SmartTodoResult) => void
  private readonly onError?: (error: Error) => void
  private recentEmbeddings: number[][] = []

  constructor(options: SmartTodoOptions) {
    this.llm = options.llm
    this.embedding = options.embedding
    this.persona = options.persona
    this.similarityThreshold = options.similarityThreshold ?? 0.95
    this.maxHistorySize = options.maxHistorySize ?? DEFAULT_MAX_HISTORY_SIZE
    this.onTodo = options.onTodo
    this.onError = options.onError
  }

  /** Replace the LLM provider at runtime (e.g., for testing or hot-swap). */
  setLlmProvider(llm: LlmProvider): void {
    this.llm = llm
  }

  /** Clear the dedup embedding cache, making previously-filtered suggestions eligible again. */
  clearHistory(): void {
    this.recentEmbeddings = []
  }

  /**
   * Generate todo suggestions from context and existing todos.
   *
   * @param context - Current user activity context.
   * @param existingTodos - Already-known todos (passed to LLM to avoid duplicates).
   * @returns SmartTodoResult with validated, deduplicated suggestions.
   *   Throws if generation fails and no onError is provided.
   */
  async generate(context: ProcessedContext, existingTodos: Todo[]): Promise<SmartTodoResult> {
    try {
      const system = this.buildSystemPrompt()
      const prompt = this.buildUserPrompt(context, existingTodos)
      const schemaDescription = [
        'Return a JSON object with:',
        '- suggestions: Array<{title: string, reason: string}>',
        '',
        'Each suggestion should be a concrete, actionable todo item.',
        'If no meaningful todos can be extracted, return { suggestions: [] }.',
      ].join('\n')

      const raw = await this.llm.generateStructured<SmartTodoResult>({
        system,
        prompt,
        schemaDescription,
      })

      const suggestions = validateSuggestions(raw)
      const dedupedSuggestions = await this.dedup(suggestions)

      const result: SmartTodoResult = { suggestions: dedupedSuggestions }

      if (dedupedSuggestions.length > 0) {
        this.onTodo?.(result)
      }

      return result
    }
    catch (cause) {
      const error = new Error(
        `SmartTodo failed (app=${context.activity.currentApp}, timestamp=${context.timestamp})`,
        { cause },
      )
      if (this.onError) {
        try { this.onError(error) }
        catch { /* onError callback itself failed */ }
        return { suggestions: [] }
      }
      throw error
    }
  }

  private async dedup(suggestions: TodoSuggestion[]): Promise<TodoSuggestion[]> {
    if (suggestions.length === 0) {
      return []
    }

    const result: TodoSuggestion[] = []

    for (const suggestion of suggestions) {
      try {
        const vector = await this.embedding.embed(suggestion.title)

        const isDuplicate = this.recentEmbeddings.some(
          existing => cosineSimilarity(existing, vector) >= this.similarityThreshold,
        )

        if (!isDuplicate) {
          result.push(suggestion)
          this.recentEmbeddings.push(vector)
          this.evictOldEmbeddings()
        }
      }
      catch {
        // Embedding failed for this suggestion — include it rather than losing it
        result.push(suggestion)
      }
    }

    return result
  }

  private evictOldEmbeddings(): void {
    while (this.recentEmbeddings.length > this.maxHistorySize) {
      this.recentEmbeddings.shift()
    }
  }

  private buildSystemPrompt(): string {
    return [
      `你是${this.persona.name}，一个虚拟 AI 角色。`,
      `性格: ${this.persona.personality}`,
      `说话风格: ${this.persona.speakingStyle}`,
      '',
      '你的任务是根据用户当前的活动状态，提取出可能的待办事项建议。',
      '建议应该具体、可操作、与用户当前活动相关。',
      '避免与已有待办事项重复。',
    ].join('\n')
  }

  private buildUserPrompt(context: ProcessedContext, existingTodos: Todo[]): string {
    const { activity } = context
    const lines = [
      '当前用户状态:',
      `- 应用: ${activity.currentApp}`,
      `- 窗口: ${activity.currentWindowTitle}`,
      `- 连续工作时长: ${activity.continuousWorkDurationMs}ms`,
      `- 是否活跃: ${activity.isActive}`,
      `- 最近应用: ${activity.recentApps.join(', ')}`,
    ]

    if (context.screenshot) {
      lines.push(`- 截图描述: ${context.screenshot.description}`)
    }

    if (existingTodos.length > 0) {
      lines.push('')
      lines.push('现有待办事项 (请避免重复):')
      for (const todo of existingTodos) {
        const status = todo.completed ? '[已完成]' : '[待办]'
        lines.push(`  ${status} ${todo.title}`)
      }
    }

    lines.push('')
    lines.push('请根据以上信息，提取出相关的待办事项建议。')

    return lines.join('\n')
  }
}
