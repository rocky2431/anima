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

export interface BrainProviders {
  llm: LlmConfig | null
  embedding: EmbeddingConfig | null
}

/**
 * Read LLM/Embedding configuration from environment variables.
 * Returns null for unconfigured providers (missing required env vars).
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

  let llm: LlmConfig | null = null
  if (llmProvider && llmApiKey && llmModel && llmBaseURL) {
    llm = {
      provider: llmProvider,
      apiKey: llmApiKey,
      baseURL: llmBaseURL,
      model: llmModel,
    }
    log.info('LLM provider configured', { provider: llmProvider, model: llmModel })
  }
  else {
    log.info('LLM provider not configured (set AIRI_LLM_PROVIDER, AIRI_LLM_API_KEY, AIRI_LLM_MODEL, AIRI_LLM_BASE_URL)')
  }

  let embedding: EmbeddingConfig | null = null
  if (embeddingProvider && embeddingApiKey && embeddingModel && embeddingBaseURL) {
    embedding = {
      provider: embeddingProvider,
      apiKey: embeddingApiKey,
      baseURL: embeddingBaseURL,
      model: embeddingModel,
    }
    log.info('Embedding provider configured', { provider: embeddingProvider, model: embeddingModel })
  }

  return { llm, embedding }
}
