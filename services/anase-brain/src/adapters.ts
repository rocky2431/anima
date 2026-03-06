import type { EmbeddingProvider, LlmProvider } from '@anase/context-engine'

import type { BrainProviders } from './providers'

import { createOpenAI } from '@ai-sdk/openai'
import { embed, generateText } from 'ai'

/**
 * Adapt BrainProviders.llm (ModelHandle) to context-engine's LlmProvider interface.
 * Uses Vercel AI SDK for all LLM calls.
 */
export function createLlmProviderAdapter(providers: BrainProviders): LlmProvider | null {
  if (!providers.llm)
    return null
  return {
    async generateText({ system, prompt }) {
      if (!providers.llm)
        throw new Error('LLM provider was cleared after adapter creation')
      const { apiKey, baseURL, model } = providers.llm.requestDefaults()
      const openai = createOpenAI({ apiKey, baseURL })
      const { text } = await generateText({
        model: openai(model),
        system,
        prompt,
      })
      if (text == null || text === '') {
        throw new Error('LLM returned no content')
      }
      return text
    },
    async generateStructured<T>({ system, prompt, schemaDescription }: { system: string, prompt: string, schemaDescription: string }) {
      if (!providers.llm)
        throw new Error('LLM provider was cleared after adapter creation')
      const { apiKey, baseURL, model } = providers.llm.requestDefaults()
      const openai = createOpenAI({ apiKey, baseURL })
      const { text } = await generateText({
        model: openai(model),
        system: `${system}\n\nRespond in JSON matching this schema: ${schemaDescription}`,
        prompt,
      })
      const raw = text ?? '{}'
      try {
        return JSON.parse(raw) as T
      }
      catch {
        throw new Error(`LLM returned invalid JSON: ${raw.slice(0, 200)}`)
      }
    },
  }
}

/**
 * Adapt BrainProviders.embedding (ModelHandle) to context-engine's EmbeddingProvider interface.
 * Uses Vercel AI SDK for embedding calls.
 */
export function createEmbeddingProviderAdapter(providers: BrainProviders): EmbeddingProvider | null {
  if (!providers.embedding)
    return null
  let cachedDimension = 0

  return {
    get dimension() {
      return cachedDimension
    },
    async embed(text: string) {
      if (!providers.embedding)
        throw new Error('Embedding provider was cleared after adapter creation')
      const { apiKey, baseURL, model } = providers.embedding.requestDefaults()
      const openai = createOpenAI({ apiKey, baseURL })
      const { embedding } = await embed({
        model: openai.embedding(model),
        value: text,
      })
      if (embedding.length === 0) {
        throw new Error('Embedding API returned empty vector')
      }
      cachedDimension = embedding.length
      return embedding
    },
  }
}
