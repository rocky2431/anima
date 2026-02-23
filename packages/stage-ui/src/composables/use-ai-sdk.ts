import type { ToolSet } from 'ai'

import type { Tool as XsaiTool } from '../types/ai-messages'

import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { tool as aiSdkTool, jsonSchema } from 'ai'

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
 * Converts an array of xsAI Tool definitions into a keyed record
 * of AI SDK CoreTool definitions.
 *
 * This is a pure adapter: it preserves the original execute functions
 * while restructuring metadata to match AI SDK's expected format.
 */
export function convertXsaiToolsToAiSdk(
  tools: XsaiTool[],
): ToolSet {
  const result: ToolSet = {}

  for (const t of tools) {
    const { name, description, parameters } = t.function

    result[name] = aiSdkTool({
      description,
      inputSchema: jsonSchema(parameters),
      execute: async (input: unknown, options: { toolCallId: string, messages: unknown[], abortSignal?: AbortSignal }) => {
        return t.execute(input, {
          toolCallId: options.toolCallId,
          messages: options.messages as Parameters<typeof t.execute>[1]['messages'],
          abortSignal: options.abortSignal,
        })
      },
    })
  }

  return result
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
