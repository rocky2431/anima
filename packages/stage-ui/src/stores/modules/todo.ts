import type { TodoFilter, TodoUI } from '../../types/memory'

import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { useModsServerChannelStore } from '../mods/api/channel-server'

const MAX_TODOS = 1000

export interface TodoSuggestion {
  title: string
  reason: string
}

export const useTodoModuleStore = defineStore('todo-module', () => {
  const todos = ref<TodoUI[]>([])
  const filter = ref<TodoFilter>('all')
  const suggestions = ref<TodoSuggestion[]>([])
  const disposers = ref<Array<() => void>>([])

  const filteredTodos = computed(() => {
    switch (filter.value) {
      case 'active':
        return todos.value.filter(t => !t.completed)
      case 'completed':
        return todos.value.filter(t => t.completed)
      default:
        return todos.value
    }
  })

  const activeCount = computed(() => todos.value.filter(t => !t.completed).length)
  const completedCount = computed(() => todos.value.filter(t => t.completed).length)

  function addTodo(title: string): void {
    const trimmed = title.trim()
    if (!trimmed || todos.value.length >= MAX_TODOS) {
      return
    }

    // Optimistic update
    const todo: TodoUI = {
      id: nanoid(),
      title: trimmed,
      completed: false,
      createdAt: Date.now(),
      completedAt: null,
    }
    todos.value = [...todos.value, todo]

    // Send to backend
    const serverChannel = useModsServerChannelStore()
    serverChannel.send({ type: 'todo:create', data: { title: trimmed } })
  }

  function toggleTodo(id: string): void {
    const target = todos.value.find(t => t.id === id)
    if (!target)
      return

    const newCompleted = !target.completed

    // Optimistic update
    todos.value = todos.value.map((t) => {
      if (t.id !== id)
        return t
      return { ...t, completed: newCompleted, completedAt: newCompleted ? Date.now() : null }
    })

    // Send to backend
    const serverChannel = useModsServerChannelStore()
    serverChannel.send({ type: 'todo:update', data: { id, completed: newCompleted } })
  }

  function deleteTodo(id: string): void {
    // Optimistic update
    todos.value = todos.value.filter(t => t.id !== id)

    // Send to backend
    const serverChannel = useModsServerChannelStore()
    serverChannel.send({ type: 'todo:delete', data: { id } })
  }

  function clearCompleted(): void {
    const completedIds = todos.value.filter(t => t.completed).map(t => t.id)
    todos.value = todos.value.filter(t => !t.completed)

    const serverChannel = useModsServerChannelStore()
    for (const id of completedIds) {
      serverChannel.send({ type: 'todo:delete', data: { id } })
    }
  }

  function setTodos(newTodos: TodoUI[]): void {
    todos.value = [...newTodos]
  }

  /**
   * Initialize WebSocket subscriptions and request initial data.
   */
  function initialize(): void {
    const serverChannel = useModsServerChannelStore()

    disposers.value.push(
      serverChannel.onEvent('todo:list', (event) => {
        setTodos(event.data.todos)
      }),
    )

    disposers.value.push(
      serverChannel.onEvent('todo:suggestions', (event) => {
        suggestions.value = [...event.data.suggestions]
      }),
    )

    // Request initial list from backend
    serverChannel.send({ type: 'todo:list', data: { todos: [] } })
  }

  function dispose(): void {
    for (const d of disposers.value) {
      d()
    }
    disposers.value = []
  }

  function resetState(): void {
    todos.value = []
    filter.value = 'all'
    suggestions.value = []
  }

  return {
    todos,
    filter,
    suggestions,
    filteredTodos,
    activeCount,
    completedCount,
    addTodo,
    toggleTodo,
    deleteTodo,
    clearCompleted,
    setTodos,
    initialize,
    dispose,
    resetState,
  }
})
