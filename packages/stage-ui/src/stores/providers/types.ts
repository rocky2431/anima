import type { ProviderBundle, ProviderConfig } from '../../libs/ai/create-provider'

// ---------------------------------------------------------------------------
// Provider capability interfaces (replaces @xsai-ext/providers/utils types)
// ---------------------------------------------------------------------------

export interface ChatProvider {
  chat: (model: string, extra?: Record<string, unknown>) => ProviderConfig
}

export interface ChatProviderWithExtraOptions<_TModel extends string = string, TExtra = Record<string, unknown>> {
  chat: (model: string, extra?: TExtra) => ProviderConfig
}

export interface SpeechProvider {
  speech: (model: string, extra?: Record<string, unknown>) => ProviderConfig
}

export interface SpeechProviderWithExtraOptions<_TModel extends string = string, TExtra = Record<string, unknown>> {
  speech: (model: string, extra?: TExtra) => ProviderConfig
}

export interface TranscriptionProvider {
  transcription: (model: string, extra?: Record<string, unknown>) => ProviderConfig
}

export interface TranscriptionProviderWithExtraOptions<_TModel extends string = string, TExtra = Record<string, unknown>> {
  transcription: (model: string, extra?: TExtra) => ProviderConfig
}

export interface EmbedProvider {
  embed: (model: string) => ProviderConfig
}

export interface EmbedProviderWithExtraOptions<_TModel extends string = string, TExtra = Record<string, unknown>> {
  embed: (model: string, extra?: TExtra) => ProviderConfig
}

// ---------------------------------------------------------------------------
// Progress info (replaces @xsai-transformers/shared/types)
// ---------------------------------------------------------------------------

export interface ProgressInfo {
  status: string
  progress?: number
  file?: string
  loaded?: number
  total?: number
}

// Re-export ProviderBundle for convenience
export type { ProviderBundle, ProviderConfig }

/**
 * Provider tier classification for the OpenRouter-First architecture.
 *
 * - `primary`: Multi-modal foundation (chat + vision + audio + function calling). OpenRouter.
 * - `enhancement`: Specialized high-quality modules (ElevenLabs TTS, Aliyun STT, etc.)
 * - `local`: Offline or privacy-first (Ollama, LM Studio)
 * - `compatible`: Generic OpenAI-compatible endpoint (user fills base URL)
 */
export type ProviderTier = 'primary' | 'enhancement' | 'local' | 'compatible'

/**
 * Capability flags that a unified provider can advertise.
 * A single provider (e.g., OpenRouter) can cover multiple capabilities.
 */
export interface ProviderCapabilities {
  chat: boolean
  vision: boolean
  speech: boolean
  transcription: boolean
  embedding: boolean
  functionCalling: boolean
}

/**
 * Result of a provider configuration validation.
 */
export interface ValidationResult {
  errors: Error[]
  reason: string
  valid: boolean
}

/**
 * Model information returned by provider `listModels` operations.
 */
export interface ModelInfo {
  id: string
  name: string
  provider: string
  description?: string
  capabilities?: string[]
  contextLength?: number
  deprecated?: boolean
}

/**
 * Voice information returned by provider `listVoices` operations.
 */
export interface VoiceInfo {
  id: string
  name: string
  provider: string
  compatibleModels?: string[]
  description?: string
  gender?: string
  deprecated?: boolean
  previewURL?: string
  languages: {
    code: string
    title: string
  }[]
}

/**
 * Transcription feature flags for providers that support STT.
 */
export interface TranscriptionFeatures {
  supportsGenerate: boolean
  supportsStreamOutput: boolean
  supportsStreamInput: boolean
}

/**
 * Runtime state tracked per provider instance.
 */
export interface ProviderRuntimeState {
  isConfigured: boolean
  validatedCredentialHash?: string
  models: ModelInfo[]
  isLoadingModels: boolean
  modelLoadError: string | null
}

/**
 * Union of all provider instance types that `createProviders` factories can return.
 */
export type AnyProviderInstance
  = | ChatProvider
    | ChatProviderWithExtraOptions
    | EmbedProvider
    | EmbedProviderWithExtraOptions
    | SpeechProvider
    | SpeechProviderWithExtraOptions
    | TranscriptionProvider
    | TranscriptionProviderWithExtraOptions

/**
 * Unified provider metadata — the single source of truth for each provider
 * in the OpenRouter-First architecture.
 *
 * Replaces the old `ProviderMetadata` interface (which used `category` to split
 * providers by function type). A unified provider can serve multiple capabilities
 * (e.g., OpenRouter serves chat + vision + speech + transcription + function calling).
 */
export interface UnifiedProviderMetadata {
  /** Unique stable identifier (e.g., 'openrouter', 'elevenlabs') */
  id: string
  /** Architectural tier */
  tier: ProviderTier
  /** English display name (fallback) */
  name: string
  /** i18n key for provider name */
  nameKey: string
  /** English description (fallback) */
  description: string
  /** i18n key for provider description */
  descriptionKey: string
  /** Capability flags */
  capabilities: ProviderCapabilities
  /** Iconify JSON icon name */
  icon?: string
  /** Icon color variant */
  iconColor?: string
  /** Image URL when no Iconify icon exists */
  iconImage?: string
  /** Display ordering (lower = higher) */
  order?: number
  /** Whether this provider is recommended (shown with a badge) */
  recommended?: boolean

  /**
   * Platform/hardware availability check.
   * If omitted the provider is always available.
   */
  isAvailableBy?: () => Promise<boolean> | boolean

  /** Returns default credential/config shape */
  defaultOptions?: () => Record<string, unknown>

  /**
   * Factory functions keyed by capability.
   * Only the capabilities this provider actually supports need an entry.
   */
  createProviders: {
    chat?: (config: Record<string, unknown>) => AnyProviderInstance | Promise<AnyProviderInstance>
    speech?: (config: Record<string, unknown>) => AnyProviderInstance | Promise<AnyProviderInstance>
    transcription?: (config: Record<string, unknown>) => AnyProviderInstance | Promise<AnyProviderInstance>
    embedding?: (config: Record<string, unknown>) => AnyProviderInstance | Promise<AnyProviderInstance>
  }

  /**
   * Operational queries that do NOT create a full provider instance.
   */
  operations: {
    listModels?: (config: Record<string, unknown>, capability?: keyof ProviderCapabilities) => Promise<ModelInfo[]>
    listVoices?: (config: Record<string, unknown>) => Promise<VoiceInfo[]>
    loadModel?: (config: Record<string, unknown>, hooks?: { onProgress?: (progress: ProgressInfo) => Promise<void> | void }) => Promise<void>
  }

  /**
   * Config validators. Every provider must supply at least `validateProviderConfig`.
   */
  validators: {
    validateProviderConfig: (config: Record<string, unknown>) => Promise<ValidationResult> | ValidationResult
  }

  /** STT feature flags (only relevant when capabilities.transcription === true) */
  transcriptionFeatures?: TranscriptionFeatures
}

/**
 * Map from legacy provider ID → unified provider ID + target capability.
 * Used by the adapter layer during migration.
 */
export interface LegacyProviderMapping {
  unifiedId: string
  capability: keyof ProviderCapabilities
}
