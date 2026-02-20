import type { ActivityBreakdownEntryUI, ActivityEntryUI, DailySummaryUI } from '../../types/memory'

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export const useActivityModuleStore = defineStore('activity-module', () => {
  const activities = ref<ActivityEntryUI[]>([])
  const todaySummary = ref<DailySummaryUI | null>(null)

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
    resetState,
  }
})
