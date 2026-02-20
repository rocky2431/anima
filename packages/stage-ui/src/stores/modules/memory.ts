import type { MemoryCategory, MemoryEntryUI } from '../../types/memory'

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export const useMemoryModuleStore = defineStore('memory-module', () => {
  const memories = ref<MemoryEntryUI[]>([])
  const searchQuery = ref('')
  const selectedCategory = ref<MemoryCategory | 'all'>('all')
  const selectedMemory = ref<MemoryEntryUI | null>(null)

  const filteredMemories = computed(() => {
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
    memories.value = memories.value.filter(m => m.id !== id)
    if (selectedMemory.value?.id === id) {
      selectedMemory.value = null
    }
  }

  function selectMemory(id: string): void {
    selectedMemory.value = memories.value.find(m => m.id === id) ?? null
  }

  function clearSelection(): void {
    selectedMemory.value = null
  }

  function resetState(): void {
    memories.value = []
    searchQuery.value = ''
    selectedCategory.value = 'all'
    selectedMemory.value = null
  }

  return {
    memories,
    searchQuery,
    selectedCategory,
    selectedMemory,
    filteredMemories,
    memoryCount,
    setMemories,
    deleteMemory,
    selectMemory,
    clearSelection,
    resetState,
  }
})
