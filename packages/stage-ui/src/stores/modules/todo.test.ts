import type { TodoUI } from '../../types/memory'

import { createTestingPinia } from '@pinia/testing'
import { setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useTodoModuleStore } from './todo'

function createTodo(overrides: Partial<TodoUI> = {}): TodoUI {
  return {
    id: `todo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: 'Test todo',
    completed: false,
    createdAt: Date.now(),
    completedAt: null,
    ...overrides,
  }
}

describe('todo module store', () => {
  beforeEach(() => {
    const pinia = createTestingPinia({ createSpy: vi.fn, stubActions: false })
    setActivePinia(pinia)
  })

  describe('initial state', () => {
    it('should start with empty todos list', () => {
      const store = useTodoModuleStore()
      expect(store.todos).toEqual([])
    })

    it('should start with "all" filter', () => {
      const store = useTodoModuleStore()
      expect(store.filter).toBe('all')
    })
  })

  describe('addTodo', () => {
    it('should add a new todo with generated id', () => {
      const store = useTodoModuleStore()
      store.addTodo('Buy groceries')
      expect(store.todos).toHaveLength(1)
      expect(store.todos[0].title).toBe('Buy groceries')
      expect(store.todos[0].completed).toBe(false)
      expect(store.todos[0].id).toBeTruthy()
    })

    it('should trim whitespace from title', () => {
      const store = useTodoModuleStore()
      store.addTodo('  Buy groceries  ')
      expect(store.todos[0].title).toBe('Buy groceries')
    })

    it('should not add empty title', () => {
      const store = useTodoModuleStore()
      store.addTodo('')
      store.addTodo('   ')
      expect(store.todos).toHaveLength(0)
    })

    it('should reject when at max capacity (1000)', () => {
      const store = useTodoModuleStore()
      const existingTodos = Array.from({ length: 1000 }, (_, i) =>
        createTodo({ id: `todo-${i}`, title: `Todo ${i}` }))
      store.setTodos(existingTodos)
      expect(store.todos).toHaveLength(1000)
      store.addTodo('One more')
      expect(store.todos).toHaveLength(1000)
    })
  })

  describe('toggleTodo', () => {
    it('should mark todo as completed', () => {
      const store = useTodoModuleStore()
      store.addTodo('Test')
      const id = store.todos[0].id
      store.toggleTodo(id)
      expect(store.todos[0].completed).toBe(true)
      expect(store.todos[0].completedAt).toBeGreaterThan(0)
    })

    it('should mark completed todo as active', () => {
      const store = useTodoModuleStore()
      store.addTodo('Test')
      const id = store.todos[0].id
      store.toggleTodo(id)
      store.toggleTodo(id)
      expect(store.todos[0].completed).toBe(false)
      expect(store.todos[0].completedAt).toBeNull()
    })

    it('should do nothing for nonexistent id', () => {
      const store = useTodoModuleStore()
      store.addTodo('Test')
      store.toggleTodo('nonexistent')
      expect(store.todos[0].completed).toBe(false)
    })
  })

  describe('deleteTodo', () => {
    it('should remove a todo by id', () => {
      const store = useTodoModuleStore()
      store.addTodo('Keep')
      store.addTodo('Remove')
      const removeId = store.todos[1].id
      store.deleteTodo(removeId)
      expect(store.todos).toHaveLength(1)
      expect(store.todos[0].title).toBe('Keep')
    })
  })

  describe('clearCompleted', () => {
    it('should remove all completed todos', () => {
      const store = useTodoModuleStore()
      store.addTodo('Active 1')
      store.addTodo('Done 1')
      store.addTodo('Active 2')
      store.toggleTodo(store.todos[1].id)
      store.clearCompleted()
      expect(store.todos).toHaveLength(2)
      expect(store.todos.every((t: TodoUI) => !t.completed)).toBe(true)
    })
  })

  describe('filteredTodos', () => {
    it('should return all todos when filter is "all"', () => {
      const store = useTodoModuleStore()
      store.addTodo('Active')
      store.addTodo('Done')
      store.toggleTodo(store.todos[1].id)
      store.filter = 'all'
      expect(store.filteredTodos).toHaveLength(2)
    })

    it('should return only active todos when filter is "active"', () => {
      const store = useTodoModuleStore()
      store.addTodo('Active')
      store.addTodo('Done')
      store.toggleTodo(store.todos[1].id)
      store.filter = 'active'
      expect(store.filteredTodos).toHaveLength(1)
      expect(store.filteredTodos[0].title).toBe('Active')
    })

    it('should return only completed todos when filter is "completed"', () => {
      const store = useTodoModuleStore()
      store.addTodo('Active')
      store.addTodo('Done')
      store.toggleTodo(store.todos[1].id)
      store.filter = 'completed'
      expect(store.filteredTodos).toHaveLength(1)
      expect(store.filteredTodos[0].title).toBe('Done')
    })
  })

  describe('computed counts', () => {
    it('should count active and completed todos', () => {
      const store = useTodoModuleStore()
      store.addTodo('A')
      store.addTodo('B')
      store.addTodo('C')
      store.toggleTodo(store.todos[0].id)
      expect(store.activeCount).toBe(2)
      expect(store.completedCount).toBe(1)
    })
  })

  describe('setTodos', () => {
    it('should replace all todos', () => {
      const store = useTodoModuleStore()
      store.addTodo('Old')
      const newTodos = [createTodo({ title: 'New 1' }), createTodo({ title: 'New 2' })]
      store.setTodos(newTodos)
      expect(store.todos).toHaveLength(2)
      expect(store.todos[0].title).toBe('New 1')
    })
  })

  describe('resetState', () => {
    it('should clear all state', () => {
      const store = useTodoModuleStore()
      store.addTodo('Test')
      store.filter = 'active'
      store.resetState()
      expect(store.todos).toEqual([])
      expect(store.filter).toBe('all')
    })
  })
})
