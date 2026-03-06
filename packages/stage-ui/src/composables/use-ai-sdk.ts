import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'

/**
 * Configuration for creating an AI SDK LanguageModel instance.
 * Uses @ai-sdk/openai for OpenAI-compatible providers (default)
 * and @ai-sdk/anthropic when provider is explicitly 'anthropic'.
 */
export interface AiSdkModelConfig {
  baseURL: string
  apiKey: string
  modelId: string
  headers?: Record<string, string>
  /** Only 'anthropic' triggers the Anthropic SDK path; all other values use OpenAI-compatible. */
  provider?: 'anthropic' | 'openai'
}

/**
 * Creates an AI SDK LanguageModel from provider configuration.
 *
 * Uses @ai-sdk/openai for OpenAI-compatible providers (default)
 * and @ai-sdk/anthropic when provider is explicitly 'anthropic'.
 */
export function createAiSdkModel(config: AiSdkModelConfig) {
  const { apiKey, modelId, headers, provider } = config
  const baseURL = config.baseURL.endsWith('/') ? config.baseURL : `${config.baseURL}/`

  if (provider === 'anthropic') {
    const anthropic = createAnthropic({ apiKey, baseURL, headers })
    return anthropic(modelId)
  }

  const openai = createOpenAI({ apiKey, baseURL, headers })
  return openai(modelId)
}
