import type { ActivityBreakdownEntryUI, ActivityEntryUI, DailySummaryUI } from '../../types/memory'

import { createTestingPinia } from '@pinia/testing'
import { setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useActivityModuleStore } from './activity'

function createActivity(overrides: Partial<ActivityEntryUI> = {}): ActivityEntryUI {
  return {
    timestamp: Date.now(),
    app: 'VS Code',
    description: 'Editing files',
    durationMs: 3600000,
    ...overrides,
  }
}

function createSummary(overrides: Partial<DailySummaryUI> = {}): DailySummaryUI {
  return {
    date: '2026-02-21',
    highlights: ['Completed feature X'],
    activityBreakdown: [
      { app: 'VS Code', durationMs: 7200000, description: 'Coding' },
    ],
    totalWorkDurationMs: 7200000,
    personalNote: 'Productive day!',
    ...overrides,
  }
}

describe('activity module store', () => {
  beforeEach(() => {
    const pinia = createTestingPinia({ createSpy: vi.fn, stubActions: false })
    setActivePinia(pinia)
  })

  describe('initial state', () => {
    it('should start with empty activities', () => {
      const store = useActivityModuleStore()
      expect(store.activities).toEqual([])
    })

    it('should start with no summary', () => {
      const store = useActivityModuleStore()
      expect(store.todaySummary).toBeNull()
    })
  })

  describe('setActivities', () => {
    it('should replace the activities list', () => {
      const store = useActivityModuleStore()
      const activities = [createActivity({ app: 'Chrome' }), createActivity({ app: 'VS Code' })]
      store.setActivities(activities)
      expect(store.activities).toHaveLength(2)
      expect(store.activities[0].app).toBe('Chrome')
    })
  })

  describe('setSummary', () => {
    it('should set today summary', () => {
      const store = useActivityModuleStore()
      const summary = createSummary()
      store.setSummary(summary)
      expect(store.todaySummary).toBeTruthy()
      expect(store.todaySummary?.date).toBe('2026-02-21')
    })

    it('should allow clearing summary', () => {
      const store = useActivityModuleStore()
      store.setSummary(createSummary())
      store.setSummary(null)
      expect(store.todaySummary).toBeNull()
    })
  })

  describe('totalWorkDuration', () => {
    it('should return total from summary', () => {
      const store = useActivityModuleStore()
      store.setSummary(createSummary({ totalWorkDurationMs: 14400000 }))
      expect(store.totalWorkDuration).toBe(14400000)
    })

    it('should return 0 when no summary', () => {
      const store = useActivityModuleStore()
      expect(store.totalWorkDuration).toBe(0)
    })
  })

  describe('appBreakdown', () => {
    it('should return breakdown from summary', () => {
      const store = useActivityModuleStore()
      const breakdown: ActivityBreakdownEntryUI[] = [
        { app: 'VS Code', durationMs: 5000000, description: 'Coding' },
        { app: 'Chrome', durationMs: 2000000, description: 'Browsing' },
      ]
      store.setSummary(createSummary({ activityBreakdown: breakdown }))
      expect(store.appBreakdown).toHaveLength(2)
      expect(store.appBreakdown[0].app).toBe('VS Code')
    })

    it('should return empty array when no summary', () => {
      const store = useActivityModuleStore()
      expect(store.appBreakdown).toEqual([])
    })
  })

  describe('highlights', () => {
    it('should return highlights from summary', () => {
      const store = useActivityModuleStore()
      store.setSummary(createSummary({ highlights: ['A', 'B'] }))
      expect(store.highlights).toEqual(['A', 'B'])
    })

    it('should return empty array when no summary', () => {
      const store = useActivityModuleStore()
      expect(store.highlights).toEqual([])
    })
  })

  describe('resetState', () => {
    it('should clear all state', () => {
      const store = useActivityModuleStore()
      store.setActivities([createActivity()])
      store.setSummary(createSummary())
      store.resetState()
      expect(store.activities).toEqual([])
      expect(store.todaySummary).toBeNull()
    })
  })
})
