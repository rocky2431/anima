import type { TodoFilter, TodoUI } from '../../types/memory'

import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

const MAX_TODOS = 1000

export const useTodoModuleStore = defineStore('todo-module', () => {
  const todos = ref<TodoUI[]>([])
  const filter = ref<TodoFilter>('all')

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

    const todo: TodoUI = {
      id: nanoid(),
      title: trimmed,
      completed: false,
      createdAt: Date.now(),
      completedAt: null,
    }
    todos.value = [...todos.value, todo]
  }

  function toggleTodo(id: string): void {
    todos.value = todos.value.map((t) => {
      if (t.id !== id) {
        return t
      }
      return {
        ...t,
        completed: !t.completed,
        completedAt: !t.completed ? Date.now() : null,
      }
    })
  }

  function deleteTodo(id: string): void {
    todos.value = todos.value.filter(t => t.id !== id)
  }

  function clearCompleted(): void {
    todos.value = todos.value.filter(t => !t.completed)
  }

  function setTodos(newTodos: TodoUI[]): void {
    todos.value = [...newTodos]
  }

  function resetState(): void {
    todos.value = []
    filter.value = 'all'
  }

  return {
    todos,
    filter,
    filteredTodos,
    activeCount,
    completedCount,
    addTodo,
    toggleTodo,
    deleteTodo,
    clearCompleted,
    setTodos,
    resetState,
  }
})
