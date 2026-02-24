import { env } from 'node:process'

import { useLogg } from '@guiiai/logg'

const log = useLogg('brain:providers').useGlobalConfig()

export interface LlmConfig {
  provider: string
  apiKey: string
  baseURL: string
  model: string
}

export interface EmbeddingConfig {
  provider: string
  apiKey: string
  baseURL: string
  model: string
}

/**
 * A callable model handle that carries the apiKey/baseURL/model
 * so callers only need to supply messages and optional overrides.
 */
export interface LlmModelHandle {
  config: LlmConfig
  /**
   * Build a partial options object pre-filled with credentials.
   * Caller merges in `messages` (and optional overrides) then passes
   * the result to `generateText()`.
   */
  requestDefaults: () => { apiKey: string, baseURL: string, model: string }
}

export interface EmbeddingModelHandle {
  config: EmbeddingConfig
  requestDefaults: () => { apiKey: string, baseURL: string, model: string }
}

export interface BrainProviders {
  llm: LlmModelHandle | null
  embedding: EmbeddingModelHandle | null
  /** Raw config accessors kept for backward-compat (same objects) */
  llmConfig: LlmConfig | null
  embeddingConfig: EmbeddingConfig | null
}

/**
 * Read LLM/Embedding configuration from environment variables and
 * create model handles that can be used directly with AI SDK's
 * `generateText()` / `embed()`.
 *
 * Required env vars for LLM: AIRI_LLM_PROVIDER, AIRI_LLM_API_KEY, AIRI_LLM_MODEL, AIRI_LLM_BASE_URL
 * Required env vars for Embedding: AIRI_EMBEDDING_PROVIDER, AIRI_EMBEDDING_API_KEY, AIRI_EMBEDDING_MODEL, AIRI_EMBEDDING_BASE_URL
 * Embedding vars fall back to LLM vars if not set (except model and base URL).
 */
export function createBrainProviders(): BrainProviders {
  const llmProvider = env.AIRI_LLM_PROVIDER ?? ''
  const llmApiKey = env.AIRI_LLM_API_KEY ?? ''
  const llmModel = env.AIRI_LLM_MODEL ?? ''
  const llmBaseURL = env.AIRI_LLM_BASE_URL ?? ''

  const embeddingProvider = env.AIRI_EMBEDDING_PROVIDER ?? llmProvider
  const embeddingApiKey = env.AIRI_EMBEDDING_API_KEY ?? llmApiKey
  const embeddingModel = env.AIRI_EMBEDDING_MODEL ?? ''
  const embeddingBaseURL = env.AIRI_EMBEDDING_BASE_URL ?? ''

  let llm: LlmModelHandle | null = null
  let llmConfig: LlmConfig | null = null
  if (llmProvider && llmApiKey && llmModel && llmBaseURL) {
    llmConfig = {
      provider: llmProvider,
      apiKey: llmApiKey,
      baseURL: llmBaseURL,
      model: llmModel,
    }
    const cfg = llmConfig
    llm = {
      config: cfg,
      requestDefaults: () => ({
        apiKey: cfg.apiKey,
        baseURL: cfg.baseURL,
        model: cfg.model,
      }),
    }
    log.log('LLM provider configured', { provider: llmProvider, model: llmModel })
  }
  else {
    log.log('LLM provider not configured (set AIRI_LLM_PROVIDER, AIRI_LLM_API_KEY, AIRI_LLM_MODEL, AIRI_LLM_BASE_URL)')
  }

  let embedding: EmbeddingModelHandle | null = null
  let embeddingConfig: EmbeddingConfig | null = null
  if (embeddingProvider && embeddingApiKey && embeddingModel && embeddingBaseURL) {
    embeddingConfig = {
      provider: embeddingProvider,
      apiKey: embeddingApiKey,
      baseURL: embeddingBaseURL,
      model: embeddingModel,
    }
    const cfg = embeddingConfig
    embedding = {
      config: cfg,
      requestDefaults: () => ({
        apiKey: cfg.apiKey,
        baseURL: cfg.baseURL,
        model: cfg.model,
      }),
    }
    log.log('Embedding provider configured', { provider: embeddingProvider, model: embeddingModel })
  }

  return { llm, embedding, llmConfig, embeddingConfig }
}

/**
 * Create or update the embedding provider handle at runtime from
 * frontend-supplied configuration.  Returns the new handle.
 */
export function createEmbeddingHandle(config: EmbeddingConfig): EmbeddingModelHandle {
  const cfg = { ...config }
  log.log('Embedding provider updated at runtime', { provider: cfg.provider, model: cfg.model })
  return {
    config: cfg,
    requestDefaults: () => ({
      apiKey: cfg.apiKey,
      baseURL: cfg.baseURL,
      model: cfg.model,
    }),
  }
}

/**
 * Create or update the LLM provider handle at runtime from
 * frontend-supplied configuration.  Returns the new handle.
 */
export function createLlmHandle(config: LlmConfig): LlmModelHandle {
  const cfg = { ...config }
  log.log('LLM provider updated at runtime', { provider: cfg.provider, model: cfg.model })
  return {
    config: cfg,
    requestDefaults: () => ({
      apiKey: cfg.apiKey,
      baseURL: cfg.baseURL,
      model: cfg.model,
    }),
  }
}
