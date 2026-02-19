import type { EmbeddingProvider, ExtractionResult, LlmProvider, PersonaConfig } from '../types'

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { MemoryOrchestrator } from '../consumption/memory-orchestrator'
import { DocumentStore } from '../storage/document-store'
import { MemoryExtractor } from '../storage/memory-extractor'
import { VectorStore } from '../storage/vector-store'

/**
 * Test Double rationale: LLM API is an external service with network dependency.
 * We control responses to verify the full extract → persist → recall pipeline.
 */
class StubLlmProvider implements LlmProvider {
  private structuredResponse: unknown

  constructor(response: unknown) {
    this.structuredResponse = response
  }

  async generateText(_options: { system: string, prompt: string }): Promise<string> {
    return JSON.stringify(this.structuredResponse)
  }

  async generateStructured<T>(_options: {
    system: string
    prompt: string
    schemaDescription: string
  }): Promise<T> {
    return this.structuredResponse as T
  }
}

/**
 * Test Double rationale: Embedding API is an external service. We use
 * deterministic vectors for predictable recall behavior.
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

const TEST_PERSONA: PersonaConfig = {
  name: '小柔',
  personality: '温柔体贴',
  speakingStyle: '说话轻柔',
}

describe('memory pipeline E2E: extract → persist → recall', () => {
  let tmpDir: string
  let docStore: DocumentStore
  let vecStore: VectorStore
  let embedding: StubEmbeddingProvider
  let orchestrator: MemoryOrchestrator
  let extractor: MemoryExtractor

  const EXTRACTION_RESULT: ExtractionResult = {
    memories: [
      { content: 'User loves hiking in mountains every weekend', importance: 9, category: 'preference' },
      { content: 'User had a productive code review session', importance: 8, category: 'event' },
    ],
    profileFacts: [
      { fact: 'prefers morning coding sessions', confidence: 0.85 },
    ],
    relationships: [
      { personName: 'Alice', relationshipType: 'team lead' },
    ],
    importantDates: [
      { date: '06-15', dateType: 'deadline', label: 'Project launch', description: 'V1 release' },
    ],
  }

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-e2e-test-'))
    docStore = new DocumentStore(path.join(tmpDir, 'anima.db'))
    vecStore = await VectorStore.create(path.join(tmpDir, 'vectors'))
    embedding = new StubEmbeddingProvider()

    const llm = new StubLlmProvider(EXTRACTION_RESULT)
    extractor = new MemoryExtractor({ llm, embedding, persona: TEST_PERSONA })

    orchestrator = new MemoryOrchestrator({
      documentStore: docStore,
      vectorStore: vecStore,
      embedding,
      workingMemoryCapacity: 20,
    })
    await orchestrator.init()
  })

  afterEach(async () => {
    docStore.close()
    await vecStore.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('completes full pipeline: extract from conversations, persist, then recall by query', async () => {
    // Phase 1: Extract
    const input = {
      conversations: [
        { role: 'user', content: 'I went hiking in the mountains this weekend, it was amazing' },
        { role: 'assistant', content: 'That sounds wonderful! What trail did you take?' },
        { role: 'user', content: 'We did a code review session with Alice today, very productive' },
      ],
      activities: [
        { app: 'VS Code', description: 'Working on TypeScript', timestamp: Date.now() },
      ],
      todos: [],
    }

    const extracted = await extractor.extract(input, [])

    // Verify extraction produced results
    expect(extracted.memories.length).toBeGreaterThan(0)
    expect(extracted.profileFacts.length).toBeGreaterThan(0)
    expect(extracted.relationships.length).toBeGreaterThan(0)

    // Phase 2: Persist
    await orchestrator.persistExtractionResults(extracted)

    // Verify persistence
    const storedMemories = docStore.getMemoryEntries(10)
    expect(storedMemories.length).toBeGreaterThan(0)

    const storedFacts = docStore.getProfileFacts()
    expect(storedFacts.length).toBeGreaterThan(0)

    const storedRelationships = docStore.getRelationships()
    expect(storedRelationships).toHaveLength(1)
    expect(storedRelationships[0].personName).toBe('Alice')

    const storedDates = docStore.getImportantDates()
    expect(storedDates).toHaveLength(1)

    // Phase 3: Recall
    const recalled = await orchestrator.recall({ text: 'hiking outdoor mountain' })
    expect(recalled.length).toBeGreaterThan(0)
    // The hiking memory should be among the top results
    expect(recalled.some(r => r.content.includes('hiking'))).toBe(true)
    expect(recalled[0].relevance).toBeGreaterThan(0)

    // Verify working memory is independent
    orchestrator.addToWorkingMemory({ id: 'wm1', role: 'user', content: 'test', createdAt: Date.now() })
    expect(orchestrator.getWorkingMemory()).toHaveLength(1)
  })
})
