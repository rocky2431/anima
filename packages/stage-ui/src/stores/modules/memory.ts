import type { MemoryCategory, MemoryEntryUI } from '../../types/memory'

import { useDebounceFn } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import { useModsServerChannelStore } from '../mods/api/channel-server'

export interface MemorySearchResult extends MemoryEntryUI {
  score: number
}

export const useMemoryModuleStore = defineStore('memory-module', () => {
  const memories = ref<MemoryEntryUI[]>([])
  const searchQuery = ref('')
  const selectedCategory = ref<MemoryCategory | 'all'>('all')
  const selectedMemory = ref<MemoryEntryUI | null>(null)
  const searchResults = ref<MemorySearchResult[]>([])
  const isSearching = ref(false)
  const disposers = ref<Array<() => void>>([])

  const filteredMemories = computed(() => {
    // When actively searching, use server search results
    if (searchQuery.value.trim() && searchResults.value.length > 0) {
      let result: MemoryEntryUI[] = searchResults.value
      if (selectedCategory.value !== 'all') {
        result = result.filter(m => m.category === selectedCategory.value)
      }
      return result
    }

    // Otherwise filter locally
    let result = memories.value
    if (selectedCategory.value !== 'all') {
      result = result.filter(m => m.category === selectedCategory.value)
    }
    if (searchQuery.value.trim()) {
      const query = searchQuery.value.toLowerCase()
      result = result.filter(m => m.content.toLowerCase().includes(query))
    }
    return result
  })

  const memoryCount = computed(() => memories.value.length)

  function setMemories(entries: MemoryEntryUI[]): void {
    memories.value = [...entries]
  }

  function deleteMemory(id: string): void {
    // Optimistic update
    memories.value = memories.value.filter(m => m.id !== id)
    if (selectedMemory.value?.id === id) {
      selectedMemory.value = null
    }

    // Send to backend
    const serverChannel = useModsServerChannelStore()
    serverChannel.send({ type: 'memory:delete', data: { id } })
  }

  function selectMemory(id: string): void {
    selectedMemory.value = memories.value.find(m => m.id === id) ?? null
  }

  function clearSelection(): void {
    selectedMemory.value = null
  }

  const debouncedSearch = useDebounceFn((query: string) => {
    if (!query.trim()) {
      searchResults.value = []
      isSearching.value = false
      return
    }

    const serverChannel = useModsServerChannelStore()
    serverChannel.send({
      type: 'memory:search',
      data: {
        query,
        category: selectedCategory.value !== 'all' ? selectedCategory.value : undefined,
      },
    })
  }, 300)

  /**
   * Initialize WebSocket subscriptions and request initial data.
   */
  function initialize(): void {
    const serverChannel = useModsServerChannelStore()

    disposers.value.push(
      serverChannel.onEvent('memory:list', (event) => {
        setMemories(event.data.memories as MemoryEntryUI[])
      }),
    )

    disposers.value.push(
      serverChannel.onEvent('memory:search:result', (event) => {
        searchResults.value = event.data.results as MemorySearchResult[]
        isSearching.value = false
      }),
    )

    disposers.value.push(
      serverChannel.onEvent('memory:deleted', (event) => {
        const { id, success } = event.data
        if (success) {
          memories.value = memories.value.filter(m => m.id !== id)
        }
      }),
    )

    // Watch searchQuery and trigger debounced backend search
    const stopWatch = watch(searchQuery, (query) => {
      if (query.trim()) {
        isSearching.value = true
      }
      debouncedSearch(query)
    })
    disposers.value.push(stopWatch)

    // Request initial list from backend
    serverChannel.send({ type: 'memory:list', data: { memories: [] } })
  }

  function dispose(): void {
    for (const d of disposers.value) {
      d()
    }
    disposers.value = []
  }

  function resetState(): void {
    memories.value = []
    searchQuery.value = ''
    selectedCategory.value = 'all'
    selectedMemory.value = null
    searchResults.value = []
    isSearching.value = false
  }

  return {
    memories,
    searchQuery,
    selectedCategory,
    selectedMemory,
    searchResults,
    isSearching,
    filteredMemories,
    memoryCount,
    setMemories,
    deleteMemory,
    selectMemory,
    clearSelection,
    initialize,
    dispose,
    resetState,
  }
})
