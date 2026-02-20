import { mkdtempSync, rmSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { FolderMonitor } from '../capture/folder-monitor'
import { DocumentProcessor } from '../processing/document-processor'
import { chunkText } from '../processing/text-chunker'
import { VectorStore } from '../storage/vector-store'

/**
 * Test Double rationale: Real embedding API requires network access and API keys.
 * This deterministic embedder produces fixed-dimension vectors from text hash for
 * testing the storage pipeline without external API dependencies.
 */
function deterministicEmbed(text: string, dimension: number): number[] {
  const vector = Array.from({ length: dimension }, () => 0)
  for (let i = 0; i < text.length; i++) {
    vector[i % dimension] += text.charCodeAt(i) / 1000
  }
  // Normalize to unit vector
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0))
  if (magnitude > 0) {
    for (let i = 0; i < vector.length; i++) {
      vector[i] /= magnitude
    }
  }
  return vector
}

describe('document pipeline integration', () => {
  let tmpDir: string
  let vectorDir: string
  let store: VectorStore
  const VECTOR_DIM = 16

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'docpipeline-test-'))
    vectorDir = join(tmpDir, 'vectors')
    store = await VectorStore.create(vectorDir)
    await store.createTable('documents', VECTOR_DIM)
  })

  afterEach(async () => {
    await store.close()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('extracts text from a file, chunks it, and stores chunks in LanceDB', async () => {
    // 1. Create a text document
    const docContent = 'The quick brown fox jumps over the lazy dog. '.repeat(50)
    const filePath = join(tmpDir, 'sample.txt')
    await writeFile(filePath, docContent)

    // 2. Extract text
    const processor = new DocumentProcessor()
    const extraction = await processor.extractText(filePath)
    expect(extraction.text).toBe(docContent)
    expect(extraction.documentType).toBe('txt')

    // 3. Chunk the text
    const chunks = chunkText(extraction.text, { chunkSize: 200, overlapSize: 50 })
    expect(chunks.length).toBeGreaterThan(1)

    // 4. Embed and store each chunk
    const vectors = chunks.map(chunk => ({
      id: `doc-chunk-${chunk.index}`,
      vector: deterministicEmbed(chunk.content, VECTOR_DIM),
      source: 'document' as const,
      content: chunk.content,
      createdAt: Date.now(),
    }))

    await store.insert('documents', vectors)

    // 5. Verify stored
    const count = await store.count('documents')
    expect(count).toBe(chunks.length)

    // 6. Verify we can search
    const queryVector = deterministicEmbed('quick brown fox', VECTOR_DIM)
    const results = await store.search('documents', queryVector, 3)
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results[0].source).toBe('document')
    expect(results[0].content.length).toBeGreaterThan(0)
  })

  it('processes multiple document types end-to-end', async () => {
    const processor = new DocumentProcessor()

    // Create text and markdown files
    const txtPath = join(tmpDir, 'notes.txt')
    const mdPath = join(tmpDir, 'readme.md')
    await writeFile(txtPath, 'Important meeting notes about the project deadline.')
    await writeFile(mdPath, '# Project README\n\nThis project implements context awareness.')

    const txtResult = await processor.extractText(txtPath)
    const mdResult = await processor.extractText(mdPath)

    // Chunk both
    const allChunks = [
      ...chunkText(txtResult.text, { chunkSize: 100, overlapSize: 20 }),
      ...chunkText(mdResult.text, { chunkSize: 100, overlapSize: 20 }),
    ]

    expect(allChunks.length).toBeGreaterThanOrEqual(2)

    // Store all in vector DB
    const vectors = allChunks.map((chunk, i) => ({
      id: `multi-doc-${i}`,
      vector: deterministicEmbed(chunk.content, VECTOR_DIM),
      source: 'document' as const,
      content: chunk.content,
      createdAt: Date.now(),
    }))

    await store.insert('documents', vectors)
    const count = await store.count('documents')
    expect(count).toBe(allChunks.length)
  })

  it('folderMonitor triggers document processing pipeline on file creation', async () => {
    const processor = new DocumentProcessor()
    const stored: string[] = []

    const monitor = new FolderMonitor({
      watchPaths: [tmpDir],
      extensions: ['.txt'],
      onChange: async (event) => {
        if (event.type === 'delete')
          return
        const extraction = await processor.extractText(event.filePath)
        const chunks = chunkText(extraction.text, { chunkSize: 200, overlapSize: 50 })
        const vectors = chunks.map((chunk, i) => ({
          id: `watch-${Date.now()}-${i}`,
          vector: deterministicEmbed(chunk.content, VECTOR_DIM),
          source: 'document' as const,
          content: chunk.content,
          createdAt: Date.now(),
        }))
        await store.insert('documents', vectors)
        stored.push(event.filePath)
      },
      onError: () => {},
    })

    await monitor.start()
    try {
      // Write a file into the watched directory
      const docContent = 'The quick brown fox jumps over the lazy dog. '.repeat(20)
      await writeFile(join(tmpDir, 'watched-doc.txt'), docContent)

      // Wait for the pipeline to process the file
      await new Promise<void>((resolve, reject) => {
        const start = Date.now()
        const check = () => {
          if (stored.length > 0) { resolve(); return }
          if (Date.now() - start > 10000) { reject(new Error('Timed out waiting for pipeline')); return }
          setTimeout(check, 200)
        }
        check()
      })

      expect(stored.length).toBeGreaterThanOrEqual(1)
      expect(stored[0]).toContain('watched-doc.txt')

      // Verify chunks made it to the vector store
      const count = await store.count('documents')
      expect(count).toBeGreaterThan(0)
    }
    finally {
      await monitor.stop()
    }
  })
})
