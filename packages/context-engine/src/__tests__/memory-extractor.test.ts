import type {
  EmbeddingProvider,
  ExtractionInput,
  ExtractionResult,
  LlmProvider,
  PersonaConfig,
} from '../types'

import { describe, expect, it } from 'vitest'

import { MemoryExtractor } from '../storage/memory-extractor'

/**
 * Test Double rationale: LLM API is an external service with network dependency,
 * rate limits, and non-deterministic output. We control responses to verify
 * prompt construction, validation, and dedup logic.
 */
class StubLlmProvider implements LlmProvider {
  readonly calls: Array<{ system: string, prompt: string, schemaDescription?: string }> = []
  private structuredResponse: unknown

  constructor(response: unknown) {
    this.structuredResponse = response
  }

  async generateText(options: { system: string, prompt: string }): Promise<string> {
    this.calls.push(options)
    return JSON.stringify(this.structuredResponse)
  }

  async generateStructured<T>(options: {
    system: string
    prompt: string
    schemaDescription: string
  }): Promise<T> {
    this.calls.push(options)
    return this.structuredResponse as T
  }
}

/**
 * Test Double rationale: Embedding API is an external service. We use
 * deterministic vectors derived from string hash to test dedup logic
 * without network calls or API costs.
 */
class StubEmbeddingProvider implements EmbeddingProvider {
  readonly dimension = 8

  async embed(text: string): Promise<number[]> {
    const vector = Array.from({ length: this.dimension }, () => 0)
    for (let i = 0; i < text.length; i++) {
      vector[i % this.dimension] += text.charCodeAt(i) / 1000
    }
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0))
    if (magnitude > 0) {
      return vector.map(v => v / magnitude)
    }
    return vector
  }
}

/**
 * Test Double rationale: Returns identical vectors for all inputs
 * to simulate "all memories are duplicates" scenario.
 */
class IdenticalEmbeddingProvider implements EmbeddingProvider {
  readonly dimension = 8
  private readonly fixedVector: number[]

  constructor() {
    this.fixedVector = Array.from({ length: this.dimension }, (_, i) => (i + 1) / this.dimension)
  }

  async embed(_text: string): Promise<number[]> {
    return [...this.fixedVector]
  }
}

const TEST_PERSONA: PersonaConfig = {
  name: '小柔',
  personality: '温柔体贴、善解人意',
  speakingStyle: '说话轻柔，常用语气词"呢"、"嘛"、"哦"',
}

const VALID_EXTRACTION: ExtractionResult = {
  memories: [
    { content: 'User enjoys hiking on weekends', importance: 8, category: 'preference' },
    { content: 'User had an important meeting with team lead', importance: 9, category: 'event' },
  ],
  profileFacts: [
    { fact: 'prefers dark mode in all editors', confidence: 0.9 },
  ],
  relationships: [
    { personName: 'Alice', relationshipType: 'colleague' },
  ],
  importantDates: [
    { date: '03-15', dateType: 'birthday', label: 'Mom birthday', description: 'Call her' },
  ],
}

function makeExtractionInput(overrides: Partial<ExtractionInput> = {}): ExtractionInput {
  return {
    conversations: [
      { role: 'user', content: '今天开会讨论了项目进度，Alice 负责前端部分' },
      { role: 'assistant', content: '听起来你今天很忙呢' },
      { role: 'user', content: '是啊，周末打算去爬山放松一下。对了，下个月15号是我妈生日' },
    ],
    activities: [
      { app: 'VS Code', description: 'Writing TypeScript code', timestamp: Date.now() - 3600000 },
      { app: 'Chrome', description: 'Browsing project docs', timestamp: Date.now() - 1800000 },
    ],
    todos: [
      { title: '完成编辑器功能', completed: false },
    ],
    ...overrides,
  }
}

describe('memoryExtractor', () => {
  describe('extract', () => {
    it('extracts memories from conversation context', async () => {
      const llm = new StubLlmProvider(VALID_EXTRACTION)
      const embedding = new StubEmbeddingProvider()
      const extractor = new MemoryExtractor({ llm, embedding, persona: TEST_PERSONA })

      const result = await extractor.extract(makeExtractionInput(), [])

      expect(result.memories.length).toBeGreaterThan(0)
      expect(result.profileFacts.length).toBeGreaterThan(0)
      expect(result.relationships.length).toBeGreaterThan(0)
      expect(result.importantDates.length).toBeGreaterThan(0)
    })

    it('includes persona context in system prompt', async () => {
      const llm = new StubLlmProvider(VALID_EXTRACTION)
      const embedding = new StubEmbeddingProvider()
      const extractor = new MemoryExtractor({ llm, embedding, persona: TEST_PERSONA })

      await extractor.extract(makeExtractionInput(), [])

      expect(llm.calls).toHaveLength(1)
      expect(llm.calls[0].system).toContain('小柔')
    })

    it('includes conversations and activities in user prompt', async () => {
      const llm = new StubLlmProvider(VALID_EXTRACTION)
      const embedding = new StubEmbeddingProvider()
      const extractor = new MemoryExtractor({ llm, embedding, persona: TEST_PERSONA })

      await extractor.extract(makeExtractionInput(), [])

      expect(llm.calls[0].prompt).toContain('Alice')
      expect(llm.calls[0].prompt).toContain('VS Code')
    })

    it('filters out memories with importance < 7', async () => {
      const lowImportance: ExtractionResult = {
        memories: [
          { content: 'important event', importance: 8, category: 'event' },
          { content: 'trivial event', importance: 3, category: 'event' },
          { content: 'borderline event', importance: 7, category: 'event' },
        ],
        profileFacts: [],
        relationships: [],
        importantDates: [],
      }
      const llm = new StubLlmProvider(lowImportance)
      const embedding = new StubEmbeddingProvider()
      const extractor = new MemoryExtractor({ llm, embedding, persona: TEST_PERSONA })

      const result = await extractor.extract(makeExtractionInput(), [])

      expect(result.memories).toHaveLength(2)
      expect(result.memories.every(m => m.importance >= 7)).toBe(true)
    })

    it('deduplicates memories against existing embeddings', async () => {
      const embedding = new IdenticalEmbeddingProvider()
      const existingEmbeddings = [await embedding.embed('any text')]

      const llm = new StubLlmProvider(VALID_EXTRACTION)
      const extractor = new MemoryExtractor({
        llm,
        embedding,
        persona: TEST_PERSONA,
        dedupThreshold: 0.95,
      })

      const result = await extractor.extract(makeExtractionInput(), existingEmbeddings)

      // All memories should be filtered as duplicates (identical embeddings)
      expect(result.memories).toHaveLength(0)
    })

    it('keeps non-duplicate memories when embeddings differ', async () => {
      const embedding = new StubEmbeddingProvider()
      const llm = new StubLlmProvider(VALID_EXTRACTION)
      const extractor = new MemoryExtractor({
        llm,
        embedding,
        persona: TEST_PERSONA,
        dedupThreshold: 0.99,
      })

      // Empty existing embeddings — nothing to dedup against
      const result = await extractor.extract(makeExtractionInput(), [])

      expect(result.memories.length).toBeGreaterThan(0)
    })

    it('validates LLM output structure', async () => {
      const invalidResult = {
        memories: 'not an array',
        profileFacts: null,
      }
      const llm = new StubLlmProvider(invalidResult)
      const embedding = new StubEmbeddingProvider()
      const extractor = new MemoryExtractor({ llm, embedding, persona: TEST_PERSONA })

      const result = await extractor.extract(makeExtractionInput(), [])

      expect(result.memories).toEqual([])
      expect(result.profileFacts).toEqual([])
      expect(result.relationships).toEqual([])
      expect(result.importantDates).toEqual([])
    })

    it('validates individual memory item fields', async () => {
      const partiallyInvalid: ExtractionResult = {
        memories: [
          { content: 'valid memory', importance: 8, category: 'event' },
          { content: 123 as unknown as string, importance: 8, category: 'event' },
          { content: 'missing importance', importance: 'high' as unknown as number, category: 'event' },
        ],
        profileFacts: [
          { fact: 'valid fact', confidence: 0.9 },
          { fact: 123 as unknown as string, confidence: 0.9 },
        ],
        relationships: [],
        importantDates: [],
      }
      const llm = new StubLlmProvider(partiallyInvalid)
      const embedding = new StubEmbeddingProvider()
      const extractor = new MemoryExtractor({ llm, embedding, persona: TEST_PERSONA })

      const result = await extractor.extract(makeExtractionInput(), [])

      expect(result.memories).toHaveLength(1)
      expect(result.memories[0].content).toBe('valid memory')
      expect(result.profileFacts).toHaveLength(1)
    })

    it('calls onExtraction callback with result', async () => {
      const results: ExtractionResult[] = []
      const llm = new StubLlmProvider(VALID_EXTRACTION)
      const embedding = new StubEmbeddingProvider()
      const extractor = new MemoryExtractor({
        llm,
        embedding,
        persona: TEST_PERSONA,
        onExtraction: r => results.push(r),
      })

      await extractor.extract(makeExtractionInput(), [])

      expect(results).toHaveLength(1)
    })

    it('forwards LLM errors to onError callback', async () => {
      const errors: Error[] = []
      const llm: LlmProvider = {
        async generateText() { throw new Error('LLM down') },
        async generateStructured() { throw new Error('LLM down') },
      }
      const embedding = new StubEmbeddingProvider()
      const extractor = new MemoryExtractor({
        llm,
        embedding,
        persona: TEST_PERSONA,
        onError: (err: Error) => errors.push(err),
      })

      const result = await extractor.extract(makeExtractionInput(), [])

      expect(result.memories).toEqual([])
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toContain('MemoryExtractor')
    })

    it('re-throws LLM errors when no onError is set', async () => {
      const llm: LlmProvider = {
        async generateText() { throw new Error('LLM down') },
        async generateStructured() { throw new Error('LLM down') },
      }
      const embedding = new StubEmbeddingProvider()
      const extractor = new MemoryExtractor({ llm, embedding, persona: TEST_PERSONA })

      await expect(
        extractor.extract(makeExtractionInput(), []),
      ).rejects.toThrow('MemoryExtractor')
    })

    it('gracefully handles embedding failures during dedup', async () => {
      const llm = new StubLlmProvider(VALID_EXTRACTION)
      const throwingEmbedding: EmbeddingProvider = {
        dimension: 8,
        async embed() { throw new Error('Embedding API down') },
      }
      const extractor = new MemoryExtractor({
        llm,
        embedding: throwingEmbedding,
        persona: TEST_PERSONA,
      })

      const result = await extractor.extract(makeExtractionInput(), [])

      // When embedding fails, memories should still be included
      expect(result.memories.length).toBeGreaterThan(0)
    })
  })
})
