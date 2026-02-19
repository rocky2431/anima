import type { DocumentStore } from '../storage/document-store'
import type { Conversation, VectorSource } from '../storage/types'
import type { VectorStore } from '../storage/vector-store'
import type { EmbeddingProvider, ExtractionResult, MemoryRecallResult } from '../types'

import * as crypto from 'node:crypto'

export interface MemoryOrchestratorOptions {
  documentStore: DocumentStore
  vectorStore: VectorStore
  embedding: EmbeddingProvider
  /** Max conversation turns to keep in working memory (default 20) */
  workingMemoryCapacity?: number
}

const MEMORY_TABLE = 'memories'

/**
 * Three-layer memory orchestrator:
 *   Layer 1: Working Memory (RAM) — recent N conversation turns
 *   Layer 2: Real-time Memory (VectorStore) — semantic vector search
 *   Layer 3: Structured Memory (DocumentStore) — profile facts, relationships, dates, entries
 *
 * Coordinates across layers for recall, persistence, and trigger support.
 */
export class MemoryOrchestrator {
  private readonly documentStore: DocumentStore
  private readonly vectorStore: VectorStore
  private readonly embedding: EmbeddingProvider
  private readonly capacity: number
  private workingMemory: Conversation[] = []

  constructor(options: MemoryOrchestratorOptions) {
    this.documentStore = options.documentStore
    this.vectorStore = options.vectorStore
    this.embedding = options.embedding
    this.capacity = options.workingMemoryCapacity ?? 20
  }

  /**
   * Initialize the memory table in vector store.
   * Must be called before using recall or persistExtractionResults.
   */
  async init(): Promise<void> {
    try {
      await this.vectorStore.createTable(MEMORY_TABLE, this.embedding.dimension)
    }
    catch (cause) {
      throw new Error('MemoryOrchestrator init failed: could not create memories table', { cause })
    }
  }

  // --- Layer 1: Working Memory ---

  addToWorkingMemory(conv: Conversation): void {
    this.workingMemory.push(conv)
    while (this.workingMemory.length > this.capacity) {
      this.workingMemory.shift()
    }
  }

  getWorkingMemory(): readonly Conversation[] {
    return [...this.workingMemory]
  }

  clearWorkingMemory(): void {
    this.workingMemory = []
  }

  // --- Layer 2+3: Recall ---

  /**
   * Recall memories semantically related to the query text.
   * Searches vector store and enriches with importance from DocumentStore.
   */
  async recall(query: {
    text: string
    topK?: number
    threshold?: number
  }): Promise<MemoryRecallResult[]> {
    try {
      const topK = query.topK ?? 10
      const threshold = query.threshold ?? 0.0

      const queryVector = await this.embedding.embed(query.text)
      const vectorResults = await this.vectorStore.semanticSearch(
        MEMORY_TABLE,
        queryVector,
        topK,
        threshold,
      )

      // Build a content → importance lookup from DocumentStore
      const storedEntries = this.documentStore.getMemoryEntries(200)
      const importanceByContent = new Map<string, number>()
      for (const entry of storedEntries) {
        importanceByContent.set(entry.content, entry.importance)
      }

      return vectorResults.map(r => ({
        content: r.content,
        category: r.source,
        importance: importanceByContent.get(r.content) ?? 0,
        relevance: r.similarity,
        sourceDate: new Date(r.createdAt).toISOString().slice(0, 10),
      }))
    }
    catch (cause) {
      throw new Error(
        `Memory recall failed for query: "${query.text.slice(0, 80)}"`,
        { cause },
      )
    }
  }

  // --- Trigger Support ---

  hasImportantDateToday(): boolean {
    const today = new Date()
    const monthDay = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const dates = this.documentStore.getImportantDatesForToday(monthDay)
    return dates.length > 0
  }

  /** Check if there are any incomplete todos. */
  hasIncompleteTodos(): boolean {
    const todos = this.documentStore.getTodos()
    return todos.some(t => !t.completed)
  }

  // --- Persistence ---

  /**
   * Persist extraction results to both VectorStore and DocumentStore.
   * Uses shared UUIDs for cross-store correlation.
   * Tolerates per-item embedding failures via Promise.allSettled.
   */
  async persistExtractionResults(results: ExtractionResult): Promise<void> {
    try {
      const now = Date.now()
      const today = new Date().toISOString().slice(0, 10)

      await this.persistMemories(results, now, today)
      this.persistProfileFacts(results, now, today)
      this.persistRelationships(results, now)
      this.persistImportantDates(results, now)
    }
    catch (cause) {
      throw new Error('Failed to persist extraction results', { cause })
    }
  }

  private async persistMemories(
    results: ExtractionResult,
    now: number,
    today: string,
  ): Promise<void> {
    if (results.memories.length === 0)
      return

    // Generate shared UUIDs and embed with allSettled for partial-failure tolerance
    const embedResults = await Promise.allSettled(
      results.memories.map(async (m) => {
        const id = crypto.randomUUID()
        const vector = await this.embedding.embed(m.content)
        return { id, vector, memory: m }
      }),
    )

    const successful: Array<{ id: string, vector: number[], memory: typeof results.memories[0] }> = []
    for (const r of embedResults) {
      if (r.status === 'fulfilled') {
        successful.push(r.value)
      }
    }

    if (successful.length > 0) {
      const vectors = successful.map(s => ({
        id: s.id,
        vector: s.vector,
        source: 'memory' as VectorSource,
        content: s.memory.content,
        createdAt: now,
      }))

      await this.vectorStore.insert(MEMORY_TABLE, vectors)

      // Use same UUID for DocumentStore correlation
      for (const s of successful) {
        this.documentStore.insertMemoryEntry({
          id: s.id,
          content: s.memory.content,
          importance: s.memory.importance,
          category: s.memory.category,
          sourceDate: today,
          createdAt: now,
        })
      }
    }
  }

  private persistProfileFacts(
    results: ExtractionResult,
    now: number,
    today: string,
  ): void {
    for (const fact of results.profileFacts) {
      this.documentStore.insertProfileFact({
        id: crypto.randomUUID(),
        fact: fact.fact,
        evidenceDate: today,
        confidence: fact.confidence,
        createdAt: now,
      })
    }
  }

  private persistRelationships(results: ExtractionResult, now: number): void {
    for (const rel of results.relationships) {
      this.documentStore.upsertRelationship({
        id: crypto.randomUUID(),
        personName: rel.personName,
        relationshipType: rel.relationshipType,
        lastMentioned: now,
        createdAt: now,
      })
    }
  }

  private persistImportantDates(results: ExtractionResult, now: number): void {
    for (const date of results.importantDates) {
      this.documentStore.insertImportantDate({
        id: crypto.randomUUID(),
        date: date.date,
        dateType: date.dateType,
        label: date.label,
        description: date.description,
        createdAt: now,
      })
    }
  }
}
