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

  const summaryStatus = ref<'idle' | 'running' | 'completed' | 'error'>('idle')

  function requestHistory(date?: string, limit?: number): void {
    const serverChannel = useModsServerChannelStore()
    serverChannel.send({
      type: 'activity:history:request',
      data: { date, limit },
    })
  }

  let summaryTimeout: ReturnType<typeof setTimeout> | null = null

  function triggerSummary(): void {
    summaryStatus.value = 'running'
    const serverChannel = useModsServerChannelStore()
    serverChannel.send({
      type: 'activity:summary:trigger',
      data: {},
    })

    // Reset to error if no response within 60s
    if (summaryTimeout)
      clearTimeout(summaryTimeout)
    summaryTimeout = setTimeout(() => {
      if (summaryStatus.value === 'running')
        summaryStatus.value = 'error'
    }, 60_000)
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
        if (summaryStatus.value === 'running') {
          summaryStatus.value = 'completed'
          if (summaryTimeout) {
            clearTimeout(summaryTimeout)
            summaryTimeout = null
          }
        }
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
    summaryStatus,
    requestHistory,
    triggerSummary,
    initialize,
    dispose,
    resetState,
  }
})
