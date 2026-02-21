import type { DocumentStore } from '@proj-airi/context-engine'
import type { Client } from '@proj-airi/server-sdk'

import { useLogg } from '@guiiai/logg'

const log = useLogg('brain:memory').useGlobalConfig()

function broadcastList(client: Client, store: DocumentStore): void {
  client.send({
    type: 'memory:list',
    data: {
      memories: store.getMemoryEntries(100),
    },
  })
}

export function registerMemoryHandler(client: Client, store: DocumentStore): void {
  client.onEvent('memory:list', () => {
    log.info('Received memory:list request')
    broadcastList(client, store)
  })

  client.onEvent('memory:search', (event) => {
    const { query, category, limit = 20 } = event.data as { query: string, category?: string, limit?: number }
    log.info('Memory search', { query, category })

    let results = store.searchMemoryEntries(query, limit)

    if (category) {
      results = results.filter(m => m.category === category)
    }

    client.send({
      type: 'memory:search:result',
      data: {
        query,
        results: results.map((m, index) => ({
          ...m,
          score: Number((1 - (index / (results.length + 1))).toFixed(4)),
        })),
      },
    })
  })

  client.onEvent('memory:delete', (event) => {
    const { id } = event.data as { id: string }
    const success = store.deleteMemoryEntry(id)
    log.info('Memory delete', { id, success })

    client.send({
      type: 'memory:deleted',
      data: { id, success },
    })

    broadcastList(client, store)
  })
}
