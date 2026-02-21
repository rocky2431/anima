import type { ActivityBreakdownEntryUI, ActivityEntryUI, DailySummaryUI } from '../../types/memory'

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { useModsServerChannelStore } from '../mods/api/channel-server'

export const useActivityModuleStore = defineStore('activity-module', () => {
  const activities = ref<ActivityEntryUI[]>([])
  const todaySummary = ref<DailySummaryUI | null>(null)
  const disposers = ref<Array<() => void>>([])

  const totalWorkDuration = computed(() => todaySummary.value?.totalWorkDurationMs ?? 0)

  const appBreakdown = computed<ActivityBreakdownEntryUI[]>(() =>
    todaySummary.value?.activityBreakdown ?? [],
  )

  const highlights = computed<string[]>(() =>
    todaySummary.value?.highlights ?? [],
  )

  function setActivities(entries: ActivityEntryUI[]): void {
    activities.value = [...entries]
  }

  function setSummary(summary: DailySummaryUI | null): void {
    todaySummary.value = summary ? { ...summary } : null
  }

  function requestHistory(date?: string, limit?: number): void {
    const serverChannel = useModsServerChannelStore()
    serverChannel.send({
      type: 'activity:history:request',
      data: { date, limit },
    })
  }

  /**
   * Initialize WebSocket subscriptions. Activity is primarily push-based —
   * the brain pushes state and summary updates without explicit requests.
   */
  function initialize(): void {
    const serverChannel = useModsServerChannelStore()

    disposers.value.push(
      serverChannel.onEvent('activity:state', (event) => {
        setActivities(event.data.activities)
      }),
    )

    disposers.value.push(
      serverChannel.onEvent('activity:summary', (event) => {
        setSummary(event.data)
      }),
    )
  }

  function dispose(): void {
    for (const d of disposers.value) {
      d()
    }
    disposers.value = []
  }

  function resetState(): void {
    activities.value = []
    todaySummary.value = null
  }

  return {
    activities,
    todaySummary,
    totalWorkDuration,
    appBreakdown,
    highlights,
    setActivities,
    setSummary,
    requestHistory,
    initialize,
    dispose,
    resetState,
  }
})
