import type { Conversation } from '../storage/types'
import type { EmbeddingProvider, ExtractionResult } from '../types'

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { MemoryOrchestrator } from '../consumption/memory-orchestrator'
import { DocumentStore } from '../storage/document-store'
import { VectorStore } from '../storage/vector-store'

/**
 * Test Double rationale: Embedding API is an external service. We use
 * deterministic vectors derived from string hash to test recall logic
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

function makeConversation(id: string, role: 'user' | 'assistant', content: string): Conversation {
  return { id, role, content, createdAt: Date.now() }
}

describe('memoryOrchestrator', () => {
  let tmpDir: string
  let docStore: DocumentStore
  let vecStore: VectorStore
  let embedding: StubEmbeddingProvider
  let orchestrator: MemoryOrchestrator

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-orch-test-'))
    docStore = new DocumentStore(path.join(tmpDir, 'anima.db'))
    vecStore = await VectorStore.create(path.join(tmpDir, 'vectors'))
    embedding = new StubEmbeddingProvider()
    orchestrator = new MemoryOrchestrator({
      documentStore: docStore,
      vectorStore: vecStore,
      embedding,
      workingMemoryCapacity: 5,
    })
    await orchestrator.init()
  })

  afterEach(async () => {
    docStore.close()
    await vecStore.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('working memory (Layer 1)', () => {
    it('stores conversations in FIFO order', () => {
      orchestrator.addToWorkingMemory(makeConversation('c1', 'user', 'hello'))
      orchestrator.addToWorkingMemory(makeConversation('c2', 'assistant', 'hi there'))

      const wm = orchestrator.getWorkingMemory()
      expect(wm).toHaveLength(2)
      expect(wm[0].content).toBe('hello')
      expect(wm[1].content).toBe('hi there')
    })

    it('evicts oldest when exceeding capacity', () => {
      for (let i = 0; i < 7; i++) {
        orchestrator.addToWorkingMemory(makeConversation(`c${i}`, 'user', `msg ${i}`))
      }

      const wm = orchestrator.getWorkingMemory()
      expect(wm).toHaveLength(5)
      expect(wm[0].content).toBe('msg 2')
      expect(wm[4].content).toBe('msg 6')
    })

    it('clears working memory', () => {
      orchestrator.addToWorkingMemory(makeConversation('c1', 'user', 'hello'))
      orchestrator.clearWorkingMemory()

      expect(orchestrator.getWorkingMemory()).toHaveLength(0)
    })

    it('returns readonly array (mutations do not affect internal state)', () => {
      orchestrator.addToWorkingMemory(makeConversation('c1', 'user', 'hello'))
      const wm = orchestrator.getWorkingMemory()
      expect(wm).toHaveLength(1)
      // getWorkingMemory returns a copy
      ;(wm as Conversation[]).push(makeConversation('c2', 'user', 'injected'))
      expect(orchestrator.getWorkingMemory()).toHaveLength(1)
    })
  })

  describe('recall (Layer 2+3)', () => {
    it('recalls memories by semantic similarity', async () => {
      // Persist some memories first
      const extractionResult: ExtractionResult = {
        memories: [
          { content: 'User likes hiking in the mountains', importance: 8, category: 'preference' },
          { content: 'User had a meeting about project deadlines', importance: 9, category: 'event' },
        ],
        profileFacts: [],
        relationships: [],
        importantDates: [],
      }
      await orchestrator.persistExtractionResults(extractionResult)

      const results = await orchestrator.recall({ text: 'hiking outdoor activities' })
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].content).toBeDefined()
      expect(typeof results[0].relevance).toBe('number')
      // P0 fix: verify importance is retrieved from DocumentStore, not hardcoded to 0
      expect(results[0].importance).toBeGreaterThan(0)
    })

    it('returns empty array when no memories stored', async () => {
      const results = await orchestrator.recall({ text: 'anything' })
      expect(results).toHaveLength(0)
    })

    it('respects topK parameter', async () => {
      const extractionResult: ExtractionResult = {
        memories: Array.from({ length: 5 }, (_, i) => ({
          content: `memory content number ${i}`,
          importance: 8,
          category: 'event',
        })),
        profileFacts: [],
        relationships: [],
        importantDates: [],
      }
      await orchestrator.persistExtractionResults(extractionResult)

      const results = await orchestrator.recall({ text: 'memory content', topK: 2 })
      expect(results.length).toBeLessThanOrEqual(2)
    })
  })

  describe('trigger support', () => {
    it('detects important dates for today', () => {
      const today = new Date()
      const monthDay = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

      docStore.insertImportantDate({
        id: 'd1',
        date: monthDay,
        dateType: 'birthday',
        label: 'Test birthday',
        description: '',
        createdAt: Date.now(),
      })

      expect(orchestrator.hasImportantDateToday()).toBe(true)
    })

    it('returns false when no important dates today', () => {
      docStore.insertImportantDate({
        id: 'd1',
        date: '12-31',
        dateType: 'birthday',
        label: 'NYE',
        description: '',
        createdAt: Date.now(),
      })

      // Unless today is actually 12-31, this should return false
      const today = new Date()
      const monthDay = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      if (monthDay !== '12-31') {
        expect(orchestrator.hasImportantDateToday()).toBe(false)
      }
    })

    it('detects near-deadline todos (uncompleted todos)', () => {
      docStore.upsertTodo({
        id: 't1',
        title: 'Finish project',
        completed: false,
        createdAt: Date.now(),
        completedAt: null,
      })

      expect(orchestrator.hasIncompleteTodos()).toBe(true)
    })

    it('returns false when all todos are completed', () => {
      docStore.upsertTodo({
        id: 't1',
        title: 'Finish project',
        completed: true,
        createdAt: Date.now(),
        completedAt: Date.now(),
      })

      expect(orchestrator.hasIncompleteTodos()).toBe(false)
    })
  })

  describe('persistExtractionResults', () => {
    it('persists memories to both vector store and document store', async () => {
      const extraction: ExtractionResult = {
        memories: [
          { content: 'User enjoys reading sci-fi', importance: 8, category: 'preference' },
        ],
        profileFacts: [
          { fact: 'works as software engineer', confidence: 0.95 },
        ],
        relationships: [
          { personName: 'Bob', relationshipType: 'friend' },
        ],
        importantDates: [
          { date: '05-20', dateType: 'birthday', label: 'Bob birthday', description: '' },
        ],
      }

      await orchestrator.persistExtractionResults(extraction)

      // Check DocumentStore
      const entries = docStore.getMemoryEntries(10)
      expect(entries).toHaveLength(1)
      expect(entries[0].content).toContain('sci-fi')

      const facts = docStore.getProfileFacts()
      expect(facts).toHaveLength(1)

      const rels = docStore.getRelationships()
      expect(rels).toHaveLength(1)
      expect(rels[0].personName).toBe('Bob')

      const dates = docStore.getImportantDates()
      expect(dates).toHaveLength(1)

      // Check VectorStore
      const vecCount = await vecStore.count('memories')
      expect(vecCount).toBe(1)
    })

    it('handles empty extraction result gracefully', async () => {
      const empty: ExtractionResult = {
        memories: [],
        profileFacts: [],
        relationships: [],
        importantDates: [],
      }

      await orchestrator.persistExtractionResults(empty)

      expect(docStore.getMemoryEntries(10)).toHaveLength(0)
      expect(docStore.getProfileFacts()).toHaveLength(0)
    })
  })
})
