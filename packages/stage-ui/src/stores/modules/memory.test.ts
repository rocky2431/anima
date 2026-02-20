import type { MemoryEntryUI } from '../../types/memory'

import { createTestingPinia } from '@pinia/testing'
import { setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useMemoryModuleStore } from './memory'

function createMemory(overrides: Partial<MemoryEntryUI> = {}): MemoryEntryUI {
  return {
    id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    content: 'Test memory content',
    importance: 7,
    category: 'event',
    sourceDate: '2026-02-20',
    createdAt: Date.now(),
    ...overrides,
  }
}

describe('memory module store', () => {
  beforeEach(() => {
    const pinia = createTestingPinia({ createSpy: vi.fn, stubActions: false })
    setActivePinia(pinia)
  })

  describe('initial state', () => {
    it('should start with empty memories list', () => {
      const store = useMemoryModuleStore()
      expect(store.memories).toEqual([])
    })

    it('should start with empty search query', () => {
      const store = useMemoryModuleStore()
      expect(store.searchQuery).toBe('')
    })

    it('should start with "all" category filter', () => {
      const store = useMemoryModuleStore()
      expect(store.selectedCategory).toBe('all')
    })

    it('should start with no selected memory', () => {
      const store = useMemoryModuleStore()
      expect(store.selectedMemory).toBeNull()
    })
  })

  describe('setMemories', () => {
    it('should replace the memories list', () => {
      const store = useMemoryModuleStore()
      const memories = [createMemory({ id: 'a' }), createMemory({ id: 'b' })]
      store.setMemories(memories)
      expect(store.memories).toHaveLength(2)
      expect(store.memories[0].id).toBe('a')
    })
  })

  describe('deleteMemory', () => {
    it('should remove a memory by id', () => {
      const store = useMemoryModuleStore()
      const memories = [createMemory({ id: 'keep' }), createMemory({ id: 'remove' })]
      store.setMemories(memories)
      store.deleteMemory('remove')
      expect(store.memories).toHaveLength(1)
      expect(store.memories[0].id).toBe('keep')
    })

    it('should do nothing if id not found', () => {
      const store = useMemoryModuleStore()
      store.setMemories([createMemory({ id: 'a' })])
      store.deleteMemory('nonexistent')
      expect(store.memories).toHaveLength(1)
    })

    it('should clear selectedMemory if deleted', () => {
      const store = useMemoryModuleStore()
      const mem = createMemory({ id: 'selected' })
      store.setMemories([mem])
      store.selectMemory('selected')
      expect(store.selectedMemory).toBeTruthy()
      store.deleteMemory('selected')
      expect(store.selectedMemory).toBeNull()
    })
  })

  describe('selectMemory', () => {
    it('should set selected memory by id', () => {
      const store = useMemoryModuleStore()
      const mem = createMemory({ id: 'sel', content: 'Selected' })
      store.setMemories([mem])
      store.selectMemory('sel')
      expect(store.selectedMemory?.id).toBe('sel')
      expect(store.selectedMemory?.content).toBe('Selected')
    })

    it('should set null if id not found', () => {
      const store = useMemoryModuleStore()
      store.setMemories([createMemory()])
      store.selectMemory('nonexistent')
      expect(store.selectedMemory).toBeNull()
    })
  })

  describe('clearSelection', () => {
    it('should clear selection via clearSelection()', () => {
      const store = useMemoryModuleStore()
      const mem = createMemory({ id: 'sel' })
      store.setMemories([mem])
      store.selectMemory('sel')
      store.clearSelection()
      expect(store.selectedMemory).toBeNull()
    })
  })

  describe('filteredMemories', () => {
    it('should return all memories when no filters', () => {
      const store = useMemoryModuleStore()
      store.setMemories([createMemory(), createMemory()])
      expect(store.filteredMemories).toHaveLength(2)
    })

    it('should filter by search query (case-insensitive)', () => {
      const store = useMemoryModuleStore()
      store.setMemories([
        createMemory({ content: 'I love coffee' }),
        createMemory({ content: 'I enjoy tea' }),
        createMemory({ content: 'Coffee is great' }),
      ])
      store.searchQuery = 'coffee'
      expect(store.filteredMemories).toHaveLength(2)
    })

    it('should filter by category', () => {
      const store = useMemoryModuleStore()
      store.setMemories([
        createMemory({ category: 'preference' }),
        createMemory({ category: 'event' }),
        createMemory({ category: 'preference' }),
      ])
      store.selectedCategory = 'preference'
      expect(store.filteredMemories).toHaveLength(2)
    })

    it('should combine search and category filters', () => {
      const store = useMemoryModuleStore()
      store.setMemories([
        createMemory({ content: 'likes coffee', category: 'preference' }),
        createMemory({ content: 'birthday party', category: 'event' }),
        createMemory({ content: 'coffee meeting', category: 'event' }),
      ])
      store.searchQuery = 'coffee'
      store.selectedCategory = 'preference'
      expect(store.filteredMemories).toHaveLength(1)
      expect(store.filteredMemories[0].content).toBe('likes coffee')
    })
  })

  describe('memoryCount', () => {
    it('should return total count', () => {
      const store = useMemoryModuleStore()
      store.setMemories([createMemory(), createMemory(), createMemory()])
      expect(store.memoryCount).toBe(3)
    })
  })

  describe('resetState', () => {
    it('should clear all state', () => {
      const store = useMemoryModuleStore()
      store.setMemories([createMemory()])
      store.searchQuery = 'test'
      store.selectedCategory = 'event'
      store.resetState()
      expect(store.memories).toEqual([])
      expect(store.searchQuery).toBe('')
      expect(store.selectedCategory).toBe('all')
      expect(store.selectedMemory).toBeNull()
    })
  })
})
