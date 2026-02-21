import type { Client } from '@proj-airi/server-sdk'

import { useLogg } from '@guiiai/logg'
import { nanoid } from 'nanoid'

interface MemoryEntry {
  id: string
  content: string
  importance: number
  category: string
  sourceDate: string
  createdAt: number
}

const log = useLogg('brain:memory').useGlobalConfig()

/**
 * In-memory store for memory entries. In production this would be backed by
 * the context-engine's MemoryOrchestrator + VectorStore. The walking skeleton
 * uses a simple Map with keyword-based search.
 */
const memories: Map<string, MemoryEntry> = new Map()

// Seed a few demo memories so the UI has something to display
function seedDemoMemories(): void {
  const seeds: Array<Omit<MemoryEntry, 'id' | 'createdAt'>> = [
    { content: 'User prefers dark mode and minimalist UI design', importance: 0.7, category: 'preference', sourceDate: new Date().toISOString() },
    { content: 'User mentioned they have a cat named Mochi', importance: 0.8, category: 'event', sourceDate: new Date().toISOString() },
    { content: 'User usually works from 9am to 6pm', importance: 0.6, category: 'habit', sourceDate: new Date().toISOString() },
  ]
  for (const seed of seeds) {
    const id = nanoid()
    memories.set(id, { ...seed, id, createdAt: Date.now() })
  }
}

seedDemoMemories()

function broadcastList(client: Client): void {
  client.send({
    type: 'memory:list',
    data: {
      memories: Array.from(memories.values()),
    },
  })
}

export function registerMemoryHandler(client: Client): void {
  client.onEvent('memory:list', () => {
    log.info('Received memory:list request')
    broadcastList(client)
  })

  client.onEvent('memory:search', (event) => {
    const { query, category, limit = 20 } = event.data as { query: string, category?: string, limit?: number }
    log.info('Memory search', { query, category })

    const lowerQuery = query.toLowerCase()
    let results = Array.from(memories.values())
      .filter((m) => {
        const matchesQuery = m.content.toLowerCase().includes(lowerQuery)
        const matchesCategory = !category || m.category === category
        return matchesQuery && matchesCategory
      })
      .map(m => ({ ...m, score: m.content.toLowerCase().includes(lowerQuery) ? 0.8 : 0.3 }))
      .sort((a, b) => b.score - a.score)

    if (limit > 0) {
      results = results.slice(0, limit)
    }

    client.send({
      type: 'memory:search:result',
      data: { query, results },
    })
  })

  client.onEvent('memory:delete', (event) => {
    const { id } = event.data as { id: string }
    const success = memories.delete(id)
    log.info('Memory delete', { id, success })

    client.send({
      type: 'memory:deleted',
      data: { id, success },
    })

    broadcastList(client)
  })
}
