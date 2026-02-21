import type { DocumentStore } from '@proj-airi/context-engine'
import type { Client } from '@proj-airi/server-sdk'

import { useLogg } from '@guiiai/logg'
import { nanoid } from 'nanoid'

const log = useLogg('brain:todo').useGlobalConfig()

function broadcastList(client: Client, store: DocumentStore): void {
  client.send({
    type: 'todo:list',
    data: {
      todos: store.getTodos(),
    },
  })
}

export function registerTodoHandler(client: Client, store: DocumentStore): void {
  client.onEvent('todo:list', () => {
    log.log('Received todo:list request')
    broadcastList(client, store)
  })

  client.onEvent('todo:create', (event) => {
    const { title } = event.data as { title: string }
    store.upsertTodo({
      id: nanoid(),
      title: title.trim(),
      completed: false,
      createdAt: Date.now(),
      completedAt: null,
    })
    log.log('Created todo', { title: title.trim() })
    broadcastList(client, store)
  })

  client.onEvent('todo:update', (event) => {
    const { id, completed, title } = event.data as { id: string, completed?: boolean, title?: string }
    const existing = store.getTodos().find(t => t.id === id)
    if (!existing) {
      log.warn('Todo not found for update', { id })
      return
    }

    store.upsertTodo({
      ...existing,
      title: title !== undefined ? title.trim() : existing.title,
      completed: completed !== undefined ? completed : existing.completed,
      completedAt: completed !== undefined ? (completed ? Date.now() : null) : existing.completedAt,
    })

    log.log('Updated todo', { id, completed })
    broadcastList(client, store)
  })

  client.onEvent('todo:delete', (event) => {
    const { id } = event.data as { id: string }
    const deleted = store.deleteTodo(id)
    log.log('Deleted todo', { id, success: deleted })
    broadcastList(client, store)
  })
}
