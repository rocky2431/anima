import type { BrainProviders } from '../providers'

import { describe, expect, it } from 'vitest'

import { createEmbeddingProviderAdapter, createLlmProviderAdapter } from '../adapters'

function createMockProviders(overrides: Partial<BrainProviders> = {}): BrainProviders {
  // Test Double rationale: ModelHandle is an interface from xsAI SDK that requires
  // actual HTTP client setup. We create a minimal stub returning test defaults.
  const defaultLlm = {
    requestDefaults: () => ({
      apiKey: 'test-key',
      baseURL: 'https://api.openai.com/v1/',
      model: 'gpt-4',
    }),
  } as BrainProviders['llm']

  const defaultEmbedding = {
    requestDefaults: () => ({
      apiKey: 'test-key',
      baseURL: 'https://api.openai.com/v1/',
      model: 'text-embedding-3-small',
    }),
  } as BrainProviders['embedding']

  return {
    llm: 'llm' in overrides ? overrides.llm! : defaultLlm,
    embedding: 'embedding' in overrides ? overrides.embedding! : defaultEmbedding,
    llmConfig: overrides.llmConfig ?? null,
    embeddingConfig: overrides.embeddingConfig ?? null,
  }
}

describe('createLlmProviderAdapter', () => {
  it('returns null when providers.llm is null', () => {
    const providers = createMockProviders({ llm: null })
    expect(createLlmProviderAdapter(providers)).toBeNull()
  })

  it('returns an adapter with generateText and generateStructured methods', () => {
    const providers = createMockProviders()
    const adapter = createLlmProviderAdapter(providers)
    expect(adapter).not.toBeNull()
    expect(typeof adapter!.generateText).toBe('function')
    expect(typeof adapter!.generateStructured).toBe('function')
  })

  it('throws when provider is cleared after adapter creation', async () => {
    const providers = createMockProviders()
    const adapter = createLlmProviderAdapter(providers)!
    providers.llm = null

    await expect(adapter.generateText({ system: 'test', prompt: 'test' }))
      .rejects
      .toThrow('LLM provider was cleared after adapter creation')
  })
})

describe('createEmbeddingProviderAdapter', () => {
  it('returns null when providers.embedding is null', () => {
    const providers = createMockProviders({ embedding: null })
    expect(createEmbeddingProviderAdapter(providers)).toBeNull()
  })

  it('returns an adapter with embed method and dimension getter', () => {
    const providers = createMockProviders()
    const adapter = createEmbeddingProviderAdapter(providers)
    expect(adapter).not.toBeNull()
    expect(typeof adapter!.embed).toBe('function')
    expect(adapter!.dimension).toBe(0) // lazy-initialized, starts at 0
  })

  it('throws when provider is cleared after adapter creation', async () => {
    const providers = createMockProviders()
    const adapter = createEmbeddingProviderAdapter(providers)!
    providers.embedding = null

    await expect(adapter.embed('test'))
      .rejects
      .toThrow('Embedding provider was cleared after adapter creation')
  })
})
