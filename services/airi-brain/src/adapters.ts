import type { EmbeddingProvider, LlmProvider } from '@proj-airi/context-engine'

import type { BrainProviders } from './providers'

/**
 * Adapt BrainProviders.llm (ModelHandle) to context-engine's LlmProvider interface.
 * Uses OpenAI-compatible chat/completions API via fetch.
 */
export function createLlmProviderAdapter(providers: BrainProviders): LlmProvider | null {
  if (!providers.llm)
    return null
  const handle = providers.llm
  return {
    async generateText({ system, prompt }) {
      const { apiKey, baseURL, model } = handle.requestDefaults()
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
      return json.choices?.[0]?.message?.content ?? ''
    },
    async generateStructured<T>({ system, prompt, schemaDescription }: { system: string, prompt: string, schemaDescription: string }) {
      const { apiKey, baseURL, model } = handle.requestDefaults()
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
  const handle = providers.embedding
  let cachedDimension = 1536

  return {
    get dimension() {
      return cachedDimension
    },
    async embed(text: string) {
      const { apiKey, baseURL, model } = handle.requestDefaults()
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
      if (embedding.length > 0)
        cachedDimension = embedding.length
      return embedding
    },
  }
}
