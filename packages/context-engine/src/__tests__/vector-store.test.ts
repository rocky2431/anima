import type { ContextVector, VectorSource } from '../storage/types'

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { VectorStore } from '../storage/vector-store'

const DIMENSION = 4

function makeVector(id: string, vector: number[], content: string, source: VectorSource = 'screenshot'): ContextVector {
  return {
    id,
    vector,
    source,
    content,
    createdAt: Date.now(),
  }
}

describe('vectorStore', () => {
  let tmpDir: string
  let store: VectorStore

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vectorstore-test-'))
    store = await VectorStore.create(tmpDir)
  })

  afterEach(async () => {
    await store.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates a table and inserts vectors', async () => {
    await store.createTable('memories', DIMENSION)
    const vectors = [
      makeVector('v1', [0.1, 0.2, 0.3, 0.4], 'first memory'),
      makeVector('v2', [0.5, 0.6, 0.7, 0.8], 'second memory'),
    ]
    await store.insert('memories', vectors)

    const count = await store.count('memories')
    expect(count).toBe(2)
  })

  it('searches for nearest vectors', async () => {
    await store.createTable('memories', DIMENSION)
    await store.insert('memories', [
      makeVector('v1', [1.0, 0.0, 0.0, 0.0], 'north'),
      makeVector('v2', [0.0, 1.0, 0.0, 0.0], 'east'),
      makeVector('v3', [0.0, 0.0, 1.0, 0.0], 'up'),
    ])

    const results = await store.search('memories', [0.9, 0.1, 0.0, 0.0], 2)
    expect(results).toHaveLength(2)
    expect(results[0].id).toBe('v1')
    expect(results[0]._distance).toBeDefined()
    expect(results[0]._distance).toBeLessThan(results[1]._distance)
  })

  it('deletes vectors by filter', async () => {
    await store.createTable('memories', DIMENSION)
    await store.insert('memories', [
      makeVector('v1', [0.1, 0.2, 0.3, 0.4], 'keep'),
      makeVector('v2', [0.5, 0.6, 0.7, 0.8], 'remove'),
    ])

    await store.delete('memories', `id = 'v2'`)
    const count = await store.count('memories')
    expect(count).toBe(1)

    const results = await store.search('memories', [0.5, 0.6, 0.7, 0.8], 10)
    expect(results.every(r => r.id !== 'v2')).toBe(true)
  })

  it('persists data across reconnect', async () => {
    await store.createTable('memories', DIMENSION)
    await store.insert('memories', [
      makeVector('v1', [0.1, 0.2, 0.3, 0.4], 'persistent data'),
    ])
    await store.close()

    const store2 = await VectorStore.create(tmpDir)
    const count = await store2.count('memories')
    expect(count).toBe(1)

    const results = await store2.search('memories', [0.1, 0.2, 0.3, 0.4], 1)
    expect(results[0].content).toBe('persistent data')
    await store2.close()

    // Reassign to prevent afterEach double-close error
    store = await VectorStore.create(tmpDir)
  })

  it('handles search on empty table', async () => {
    await store.createTable('empty', DIMENSION)
    const results = await store.search('empty', [0.1, 0.2, 0.3, 0.4], 5)
    expect(results).toHaveLength(0)
  })
})
