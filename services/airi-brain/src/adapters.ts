import type { EmbeddingProvider, LlmProvider } from '@proj-airi/context-engine'

import type { BrainProviders } from './providers'

/**
 * Adapt BrainProviders.llm (ModelHandle) to context-engine's LlmProvider interface.
 * Uses OpenAI-compatible chat/completions API via fetch.
 */
export function createLlmProviderAdapter(providers: BrainProviders): LlmProvider | null {
  if (!providers.llm)
    return null
  return {
    async generateText({ system, prompt }) {
      if (!providers.llm)
        throw new Error('LLM provider was cleared after adapter creation')
      const { apiKey, baseURL, model } = providers.llm.requestDefaults()
      const base = baseURL.endsWith('/') ? baseURL : `${baseURL}/`
      const url = new URL('chat/completions', base)
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: prompt },
          ],
        }),
      })
      if (!response.ok) {
        const body = await response.text().catch(() => '')
        throw new Error(`LLM generateText failed: HTTP ${response.status} — ${body}`)
      }
      const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
      const content = json.choices?.[0]?.message?.content
      if (content == null) {
        throw new Error(`LLM returned no content: choices=${JSON.stringify(json.choices?.length ?? 0)}`)
      }
      return content
    },
    async generateStructured<T>({ system, prompt, schemaDescription }: { system: string, prompt: string, schemaDescription: string }) {
      if (!providers.llm)
        throw new Error('LLM provider was cleared after adapter creation')
      const { apiKey, baseURL, model } = providers.llm.requestDefaults()
      const base = baseURL.endsWith('/') ? baseURL : `${baseURL}/`
      const url = new URL('chat/completions', base)
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: `${system}\n\nRespond in JSON matching this schema: ${schemaDescription}` },
            { role: 'user', content: prompt },
          ],
        }),
      })
      if (!response.ok) {
        const body = await response.text().catch(() => '')
        throw new Error(`LLM generateStructured failed: HTTP ${response.status} — ${body}`)
      }
      const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
      const text = json.choices?.[0]?.message?.content ?? '{}'
      try {
        return JSON.parse(text) as T
      }
      catch {
        throw new Error(`LLM returned invalid JSON: ${text.slice(0, 200)}`)
      }
    },
  }
}

/**
 * Adapt BrainProviders.embedding (ModelHandle) to context-engine's EmbeddingProvider interface.
 * Uses OpenAI-compatible embeddings API via fetch.
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
      const base = baseURL.endsWith('/') ? baseURL : `${baseURL}/`
      const url = new URL('embeddings', base)
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model, input: text }),
      })
      if (!response.ok) {
        const body = await response.text().catch(() => '')
        throw new Error(`Embedding failed: HTTP ${response.status} — ${body}`)
      }
      const json = await response.json() as { data?: Array<{ embedding?: number[] }> }
      const embedding = json.data?.[0]?.embedding ?? []
      if (embedding.length === 0) {
        throw new Error('Embedding API returned empty vector')
      }
      cachedDimension = embedding.length
      return embedding
    },
  }
}
