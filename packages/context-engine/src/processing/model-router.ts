import type { LlmProvider } from '../types'

export type TaskType = 'classification' | 'extraction' | 'generation' | 'summarization'
export type ModelTier = 'lightweight' | 'standard' | 'local'

export interface ModelRouterOptions {
  providers: {
    /** Cheap, fast model for classification & extraction (e.g., Haiku, Flash) */
    lightweight: LlmProvider
    /** High-quality model for generation & summarization (e.g., Sonnet, 4o) */
    standard: LlmProvider
    /** Optional free local model for high-frequency low-quality tasks (e.g., node-llama-cpp) */
    local?: LlmProvider
  }
  /** Override the default task→tier mapping for specific task types. */
  routingOverrides?: Partial<Record<TaskType, ModelTier>>
}

export interface RoutingStats {
  totalCalls: number
  callsByTier: Record<ModelTier, number>
  callsByTaskType: Record<TaskType, number>
  /**
   * Estimated cost savings ratio (0-1).
   * Computed as (local + lightweight calls) / total calls.
   * Higher values mean more calls are being routed to cheaper tiers.
   */
  estimatedSavingsRatio: number
}

// --- Task Classification (Functional Core) ---

const CLASSIFICATION_KEYWORDS = ['classify', 'categorize', 'categorise', 'label', 'tag']
const EXTRACTION_KEYWORDS = ['extract', 'named entit', 'entity', 'entities']
const SUMMARIZATION_KEYWORDS = ['summariz', 'summarise', 'summary', 'context summarizer']
const GENERATION_KEYWORDS = ['generate', 'create', 'produce', 'compose', 'write']

const EXTRACTION_SCHEMA_KEYWORDS = ['persons', 'organizations', 'locations', 'technologies']

/**
 * Classify a task based on its system prompt and optional schema description.
 * Pure function — no side effects.
 */
export function classifyTask(system: string, schemaDescription?: string): TaskType {
  const systemLower = system.toLowerCase()

  // Check schema description first (more specific signal)
  if (schemaDescription) {
    const schemaLower = schemaDescription.toLowerCase()
    if (EXTRACTION_SCHEMA_KEYWORDS.some(kw => schemaLower.includes(kw))) {
      return 'extraction'
    }
  }

  // Check system prompt keywords in priority order
  if (CLASSIFICATION_KEYWORDS.some(kw => systemLower.includes(kw))) {
    return 'classification'
  }
  if (EXTRACTION_KEYWORDS.some(kw => systemLower.includes(kw))) {
    return 'extraction'
  }
  if (SUMMARIZATION_KEYWORDS.some(kw => systemLower.includes(kw))) {
    return 'summarization'
  }
  if (GENERATION_KEYWORDS.some(kw => systemLower.includes(kw))) {
    return 'generation'
  }

  // Default to generation (highest quality, safest fallback)
  return 'generation'
}

// --- Default routing table ---

const DEFAULT_ROUTING: Record<TaskType, ModelTier> = {
  classification: 'lightweight',
  extraction: 'lightweight',
  summarization: 'standard',
  generation: 'standard',
}

const LOCAL_ELIGIBLE_TASKS: ReadonlySet<TaskType> = new Set<TaskType>([
  'classification',
  'extraction',
])

/**
 * Resolve which tier should handle a given task type,
 * considering provider availability and overrides.
 */
function resolveTier(
  taskType: TaskType,
  hasLocal: boolean,
  overrides?: Partial<Record<TaskType, ModelTier>>,
): ModelTier {
  // Check explicit override first
  if (overrides?.[taskType]) {
    return overrides[taskType]!
  }

  // Route to local if available and task is eligible
  if (hasLocal && LOCAL_ELIGIBLE_TASKS.has(taskType)) {
    return 'local'
  }

  return DEFAULT_ROUTING[taskType]
}

// --- ModelRouter (Imperative Shell) ---

/**
 * Routes LLM calls to the appropriate model tier based on task classification.
 *
 * Implements the LlmProvider interface so it can be used as a drop-in replacement
 * in ContextMerger, EntityExtractor, SmartTip, and other consumers.
 *
 * Routing strategy:
 * - classification/extraction → local (free) or lightweight (cheap)
 * - summarization/generation → standard (high quality)
 */
export class ModelRouter implements LlmProvider {
  private readonly providers: ModelRouterOptions['providers']
  private readonly overrides?: Partial<Record<TaskType, ModelTier>>
  private readonly hasLocal: boolean

  private tierCalls: Record<ModelTier, number> = { lightweight: 0, standard: 0, local: 0 }
  private taskCalls: Record<TaskType, number> = { classification: 0, extraction: 0, generation: 0, summarization: 0 }

  constructor(options: ModelRouterOptions) {
    this.providers = options.providers
    this.overrides = options.routingOverrides
    this.hasLocal = options.providers.local != null
  }

  async generateText(options: { system: string, prompt: string }): Promise<string> {
    const taskType = classifyTask(options.system)
    const tier = resolveTier(taskType, this.hasLocal, this.overrides)
    const provider = this.getProvider(tier)

    try {
      const result = await provider.generateText(options)
      this.tierCalls[tier]++
      this.taskCalls[taskType]++
      return result
    }
    catch (cause) {
      throw new Error(`ModelRouter: ${tier} provider failed for ${taskType} task`, { cause })
    }
  }

  async generateStructured<T>(options: {
    system: string
    prompt: string
    schemaDescription: string
  }): Promise<T> {
    const taskType = classifyTask(options.system, options.schemaDescription)
    const tier = resolveTier(taskType, this.hasLocal, this.overrides)
    const provider = this.getProvider(tier)

    try {
      const result = await provider.generateStructured<T>(options)
      this.tierCalls[tier]++
      this.taskCalls[taskType]++
      return result
    }
    catch (cause) {
      throw new Error(`ModelRouter: ${tier} provider failed for ${taskType} task`, { cause })
    }
  }

  getStats(): RoutingStats {
    const total = this.tierCalls.lightweight + this.tierCalls.standard + this.tierCalls.local
    const cheapCalls = this.tierCalls.local + this.tierCalls.lightweight
    return {
      totalCalls: total,
      callsByTier: { ...this.tierCalls },
      callsByTaskType: { ...this.taskCalls },
      estimatedSavingsRatio: total > 0 ? cheapCalls / total : 0,
    }
  }

  /** Serializable snapshot of routing stats for structured logging or persistence. */
  toJSON(): RoutingStats {
    return this.getStats()
  }

  resetStats(): void {
    this.tierCalls = { lightweight: 0, standard: 0, local: 0 }
    this.taskCalls = { classification: 0, extraction: 0, generation: 0, summarization: 0 }
  }

  private getProvider(tier: ModelTier): LlmProvider {
    switch (tier) {
      case 'local':
        return this.providers.local ?? this.providers.lightweight
      case 'lightweight':
        return this.providers.lightweight
      case 'standard':
        return this.providers.standard
    }
  }
}
