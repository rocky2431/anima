import type { Client } from '@proj-airi/server-sdk'

import { useLogg } from '@guiiai/logg'
import { nanoid } from 'nanoid'

interface TodoItem {
  id: string
  title: string
  completed: boolean
  createdAt: number
  completedAt: number | null
}

const log = useLogg('brain:todo').useGlobalConfig()

/**
 * In-memory todo store. In a production setup this would be backed by SQLite
 * via the context-engine's SmartTodo, but for the walking skeleton we keep it
 * simple and persist across the process lifetime.
 */
const todos: Map<string, TodoItem> = new Map()

function broadcastList(client: Client): void {
  client.send({
    type: 'todo:list',
    data: {
      todos: Array.from(todos.values()),
    },
  })
}

export function registerTodoHandler(client: Client): void {
  client.onEvent('todo:list', () => {
    log.info('Received todo:list request')
    broadcastList(client)
  })

  client.onEvent('todo:create', (event) => {
    const { title } = event.data as { title: string }
    const todo: TodoItem = {
      id: nanoid(),
      title: title.trim(),
      completed: false,
      createdAt: Date.now(),
      completedAt: null,
    }
    todos.set(todo.id, todo)
    log.info('Created todo', { id: todo.id, title: todo.title })
    broadcastList(client)
  })

  client.onEvent('todo:update', (event) => {
    const { id, completed, title } = event.data as { id: string, completed?: boolean, title?: string }
    const todo = todos.get(id)
    if (!todo) {
      log.warn('Todo not found for update', { id })
      return
    }

    if (completed !== undefined) {
      todo.completed = completed
      todo.completedAt = completed ? Date.now() : null
    }
    if (title !== undefined) {
      todo.title = title.trim()
    }

    log.info('Updated todo', { id, completed: todo.completed })
    broadcastList(client)
  })

  client.onEvent('todo:delete', (event) => {
    const { id } = event.data as { id: string }
    const deleted = todos.delete(id)
    log.info('Deleted todo', { id, success: deleted })
    broadcastList(client)
  })
}
