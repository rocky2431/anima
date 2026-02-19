import type { ContextVector } from '../storage/types'

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { VectorStore } from '../storage/vector-store'

const DIMENSION = 4

/** Create a normalized vector for consistent cosine similarity testing. */
function normalize(v: number[]): number[] {
  const mag = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0))
  return mag > 0 ? v.map(x => x / mag) : v
}

function makeVector(id: string, vector: number[], content: string): ContextVector {
  return { id, vector, source: 'memory', content, createdAt: Date.now() }
}

describe('vectorStore semanticSearch', () => {
  let tmpDir: string
  let store: VectorStore

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vectorstore-semantic-test-'))
    store = await VectorStore.create(tmpDir)
  })

  afterEach(async () => {
    await store.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns results with similarity score', async () => {
    await store.createTable('memories', DIMENSION)
    const v1 = normalize([1, 0, 0, 0])
    const v2 = normalize([0, 1, 0, 0])
    await store.insert('memories', [
      makeVector('v1', v1, 'north'),
      makeVector('v2', v2, 'east'),
    ])

    const results = await store.semanticSearch('memories', v1, 2)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].id).toBe('v1')
    expect(results[0].similarity).toBeGreaterThan(0.9)
    expect(typeof results[0].similarity).toBe('number')
  })

  it('filters by similarity threshold', async () => {
    await store.createTable('memories', DIMENSION)
    const v1 = normalize([1, 0, 0, 0])
    const v2 = normalize([0, 0, 0, 1])
    await store.insert('memories', [
      makeVector('v1', v1, 'very similar'),
      makeVector('v2', v2, 'very different'),
    ])

    // High threshold should only return the very similar match
    const results = await store.semanticSearch('memories', v1, 10, 0.85)
    expect(results.every(r => r.similarity >= 0.85)).toBe(true)
    expect(results.some(r => r.id === 'v1')).toBe(true)
  })

  it('returns empty array for empty table', async () => {
    await store.createTable('memories', DIMENSION)
    const results = await store.semanticSearch('memories', normalize([1, 0, 0, 0]), 5)
    expect(results).toHaveLength(0)
  })

  it('respects topK limit after threshold filter', async () => {
    await store.createTable('memories', DIMENSION)
    const base = normalize([1, 0.1, 0, 0])
    // Insert multiple similar vectors
    const vectors = Array.from({ length: 5 }, (_, i) =>
      makeVector(`v${i}`, normalize([1, 0.1 * (i + 1), 0, 0]), `memory ${i}`))
    await store.insert('memories', vectors)

    const results = await store.semanticSearch('memories', base, 2)
    expect(results.length).toBeLessThanOrEqual(2)
  })
})
