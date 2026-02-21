import type { ContextUpdate } from '@proj-airi/server-sdk'

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { useModsServerChannelStore } from '../mods/api/channel-server'

export interface ContextEntry {
  id: string
  contextId: string
  lane?: string
  text: string
  ideas?: string[]
  hints?: string[]
  timestamp: number
}

const MAX_ENTRIES = 100

export const useContextDisplayStore = defineStore('context-display-module', () => {
  const entries = ref<ContextEntry[]>([])
  const disposers = ref<Array<() => void>>([])

  const latestEntries = computed(() => entries.value.slice(0, 20))
  const entryCount = computed(() => entries.value.length)

  const laneGroups = computed(() => {
    const groups: Record<string, ContextEntry[]> = {}
    for (const entry of entries.value) {
      const lane = entry.lane ?? 'default'
      if (!groups[lane]) {
        groups[lane] = []
      }
      groups[lane].push(entry)
    }
    return groups
  })

  function initialize(): void {
    const serverChannel = useModsServerChannelStore()

    disposers.value.push(
      serverChannel.onEvent('context:update', (event) => {
        const update = event.data as ContextUpdate
        const entry: ContextEntry = {
          id: update.id,
          contextId: update.contextId,
          lane: update.lane,
          text: update.text,
          ideas: update.ideas,
          hints: update.hints,
          timestamp: Date.now(),
        }

        entries.value = [entry, ...entries.value].slice(0, MAX_ENTRIES)
      }),
    )
  }

  function dispose(): void {
    for (const d of disposers.value) {
      d()
    }
    disposers.value = []
  }

  function clearEntries(): void {
    entries.value = []
  }

  function resetState(): void {
    entries.value = []
  }

  return {
    entries,
    latestEntries,
    entryCount,
    laneGroups,
    initialize,
    dispose,
    clearEntries,
    resetState,
  }
})
