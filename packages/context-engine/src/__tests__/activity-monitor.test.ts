import type { ActivityEvent, ProcessedContext } from '../types'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ActivityMonitor } from '../consumption/activity-monitor'

function makeEvent(timestamp: number, overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    timestamp,
    appName: 'VS Code',
    windowTitle: 'editor.ts',
    isFullscreen: false,
    ...overrides,
  }
}

describe('activityMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('event recording', () => {
    it('tracks continuous work duration from recorded events', () => {
      const monitor = new ActivityMonitor({})
      const base = Date.now()

      monitor.recordEvent(makeEvent(base))
      monitor.recordEvent(makeEvent(base + 60_000))
      monitor.recordEvent(makeEvent(base + 120_000))

      const state = monitor.getState()
      expect(state.continuousWorkDurationMs).toBe(120_000)
    })

    it('updates current app and window from latest event', () => {
      const monitor = new ActivityMonitor({})
      const base = Date.now()

      monitor.recordEvent(makeEvent(base, { appName: 'Chrome', windowTitle: 'Google' }))
      monitor.recordEvent(makeEvent(base + 1000, { appName: 'Slack', windowTitle: 'General' }))

      const state = monitor.getState()
      expect(state.currentApp).toBe('Slack')
      expect(state.currentWindowTitle).toBe('General')
    })

    it('tracks fullscreen state from latest event', () => {
      const monitor = new ActivityMonitor({})
      const base = Date.now()

      monitor.recordEvent(makeEvent(base, { isFullscreen: true }))

      const state = monitor.getState()
      expect(state.isFullscreen).toBe(true)
    })
  })

  describe('app switch tracking', () => {
    it('correctly updates activity state on app switch', () => {
      const monitor = new ActivityMonitor({})
      const base = Date.now()

      monitor.recordEvent(makeEvent(base, { appName: 'Chrome', windowTitle: 'Google' }))
      monitor.recordEvent(makeEvent(base + 30_000, { appName: 'VS Code', windowTitle: 'index.ts' }))
      monitor.recordEvent(makeEvent(base + 60_000, { appName: 'Slack', windowTitle: 'random' }))

      const state = monitor.getState()
      expect(state.currentApp).toBe('Slack')
      expect(state.recentApps).toContain('Chrome')
      expect(state.recentApps).toContain('VS Code')
      expect(state.recentApps).toContain('Slack')
    })

    it('deduplicates recent apps list', () => {
      const monitor = new ActivityMonitor({})
      const base = Date.now()

      monitor.recordEvent(makeEvent(base, { appName: 'Chrome' }))
      monitor.recordEvent(makeEvent(base + 1000, { appName: 'VS Code' }))
      monitor.recordEvent(makeEvent(base + 2000, { appName: 'Chrome' }))

      const state = monitor.getState()
      const chromeCount = state.recentApps.filter(a => a === 'Chrome').length
      expect(chromeCount).toBe(1)
    })

    it('orders recent apps most-recent-first', () => {
      const monitor = new ActivityMonitor({})
      const base = Date.now()

      monitor.recordEvent(makeEvent(base, { appName: 'Chrome' }))
      monitor.recordEvent(makeEvent(base + 1000, { appName: 'VS Code' }))
      monitor.recordEvent(makeEvent(base + 2000, { appName: 'Slack' }))

      const state = monitor.getState()
      expect(state.recentApps[0]).toBe('Slack')
      expect(state.recentApps[1]).toBe('VS Code')
      expect(state.recentApps[2]).toBe('Chrome')
    })

    it('limits recent apps to maxRecentApps', () => {
      const monitor = new ActivityMonitor({ maxRecentApps: 2 })
      const base = Date.now()

      monitor.recordEvent(makeEvent(base, { appName: 'Chrome' }))
      monitor.recordEvent(makeEvent(base + 1000, { appName: 'VS Code' }))
      monitor.recordEvent(makeEvent(base + 2000, { appName: 'Slack' }))

      const state = monitor.getState()
      expect(state.recentApps).toHaveLength(2)
      expect(state.recentApps).toContain('Slack')
      expect(state.recentApps).toContain('VS Code')
      expect(state.recentApps).not.toContain('Chrome')
    })
  })

  describe('active/inactive detection', () => {
    it('reports active when recent event exists within inactivity threshold', () => {
      const monitor = new ActivityMonitor({ inactivityThresholdMs: 5 * 60 * 1000 })
      const now = Date.now()
      vi.setSystemTime(now)

      monitor.recordEvent(makeEvent(now - 60_000)) // 1 minute ago

      const state = monitor.getState()
      expect(state.isActive).toBe(true)
    })

    it('reports inactive when no event within inactivity threshold', () => {
      const monitor = new ActivityMonitor({ inactivityThresholdMs: 5 * 60 * 1000 })
      const now = Date.now()
      vi.setSystemTime(now)

      monitor.recordEvent(makeEvent(now - 10 * 60 * 1000)) // 10 minutes ago

      const state = monitor.getState()
      expect(state.isActive).toBe(false)
    })

    it('reports inactive when no events recorded', () => {
      const monitor = new ActivityMonitor({})

      const state = monitor.getState()
      expect(state.isActive).toBe(false)
    })
  })

  describe('context emission via tick', () => {
    it('emits ProcessedContext via onContext callback on tick', () => {
      const contexts: ProcessedContext[] = []
      const monitor = new ActivityMonitor({
        onContext: ctx => contexts.push(ctx),
      })
      const now = Date.now()
      vi.setSystemTime(now)

      monitor.recordEvent(makeEvent(now - 60_000, { appName: 'VS Code' }))
      monitor.recordEvent(makeEvent(now, { appName: 'Chrome' }))

      monitor.tick()

      expect(contexts).toHaveLength(1)
      expect(contexts[0].activity.currentApp).toBe('Chrome')
      expect(contexts[0].activity.continuousWorkDurationMs).toBe(60_000)
      expect(contexts[0].timestamp).toBe(now)
    })

    it('includes screenshot context in ProcessedContext when set', () => {
      const contexts: ProcessedContext[] = []
      const monitor = new ActivityMonitor({
        onContext: ctx => contexts.push(ctx),
      })
      const now = Date.now()
      vi.setSystemTime(now)

      monitor.recordEvent(makeEvent(now))
      monitor.setScreenshotContext({
        description: 'User coding in VS Code',
        entities: ['VS Code', 'TypeScript'],
        activity: 'coding',
        timestamp: now,
        hash: '0'.repeat(64),
      })

      monitor.tick()

      expect(contexts[0].screenshot).toBeDefined()
      expect(contexts[0].screenshot!.description).toBe('User coding in VS Code')
    })

    it('clears screenshot context after tick', () => {
      const contexts: ProcessedContext[] = []
      const monitor = new ActivityMonitor({
        onContext: ctx => contexts.push(ctx),
      })
      const now = Date.now()
      vi.setSystemTime(now)

      monitor.recordEvent(makeEvent(now))
      monitor.setScreenshotContext({
        description: 'coding',
        entities: [],
        activity: 'coding',
        timestamp: now,
        hash: '0'.repeat(64),
      })

      monitor.tick()
      monitor.tick()

      expect(contexts[0].screenshot).toBeDefined()
      expect(contexts[1].screenshot).toBeUndefined()
    })
  })

  describe('periodic aggregation', () => {
    it('starts and stops periodic ticking', () => {
      const contexts: ProcessedContext[] = []
      const monitor = new ActivityMonitor({
        aggregationIntervalMs: 1000,
        onContext: ctx => contexts.push(ctx),
      })
      const now = Date.now()
      vi.setSystemTime(now)

      monitor.recordEvent(makeEvent(now))
      monitor.start()
      expect(monitor.isRunning).toBe(true)

      vi.advanceTimersByTime(1000)
      expect(contexts).toHaveLength(1)

      vi.advanceTimersByTime(1000)
      expect(contexts).toHaveLength(2)

      monitor.stop()
      expect(monitor.isRunning).toBe(false)

      vi.advanceTimersByTime(1000)
      expect(contexts).toHaveLength(2) // no more after stop
    })

    it('uses default 15-minute aggregation interval', () => {
      const contexts: ProcessedContext[] = []
      const monitor = new ActivityMonitor({
        onContext: ctx => contexts.push(ctx),
      })
      const now = Date.now()
      vi.setSystemTime(now)

      monitor.recordEvent(makeEvent(now))
      monitor.start()

      vi.advanceTimersByTime(14 * 60 * 1000)
      expect(contexts).toHaveLength(0) // not yet

      vi.advanceTimersByTime(60 * 1000) // total = 15 min
      expect(contexts).toHaveLength(1)

      monitor.stop()
    })
  })

  describe('event window management', () => {
    it('trims old events outside the retention window', () => {
      const monitor = new ActivityMonitor({
        eventRetentionMs: 60_000, // keep 1 minute of events
      })
      const now = Date.now()
      vi.setSystemTime(now)

      // Old event outside retention window
      monitor.recordEvent(makeEvent(now - 120_000, { appName: 'Old App' }))
      // Recent events
      monitor.recordEvent(makeEvent(now - 30_000, { appName: 'Recent App' }))
      monitor.recordEvent(makeEvent(now, { appName: 'Current App' }))

      const state = monitor.getState()
      // Old app should have been trimmed
      expect(state.recentApps).not.toContain('Old App')
      expect(state.currentApp).toBe('Current App')
    })
  })

  describe('error handling', () => {
    it('reports errors via onError when onContext throws', () => {
      const errors: Error[] = []
      const monitor = new ActivityMonitor({
        onContext: () => {
          throw new Error('callback failed')
        },
        onError: (err: Error) => errors.push(err),
      })
      const now = Date.now()
      vi.setSystemTime(now)

      monitor.recordEvent(makeEvent(now))
      monitor.tick()

      expect(errors).toHaveLength(1)
      expect(errors[0].message).toBe('ActivityMonitor tick failed')
      expect(errors[0].cause).toBeInstanceOf(Error)
    })

    it('re-throws error when onContext throws and no onError is set', () => {
      const monitor = new ActivityMonitor({
        onContext: () => {
          throw new Error('callback failed')
        },
      })
      const now = Date.now()
      vi.setSystemTime(now)

      monitor.recordEvent(makeEvent(now))

      expect(() => monitor.tick()).toThrow('ActivityMonitor tick failed')
    })
  })

  describe('tick return value', () => {
    it('returns ProcessedContext from tick()', () => {
      const monitor = new ActivityMonitor({})
      const now = Date.now()
      vi.setSystemTime(now)

      monitor.recordEvent(makeEvent(now, { appName: 'Chrome' }))

      const result = monitor.tick()
      expect(result.activity.currentApp).toBe('Chrome')
      expect(result.timestamp).toBe(now)
    })
  })

  describe('start idempotency', () => {
    it('does not create duplicate timers on double-start', () => {
      const contexts: ProcessedContext[] = []
      const monitor = new ActivityMonitor({
        aggregationIntervalMs: 1000,
        onContext: (ctx: ProcessedContext) => contexts.push(ctx),
      })
      const now = Date.now()
      vi.setSystemTime(now)

      monitor.recordEvent(makeEvent(now))
      monitor.start()
      monitor.start() // double-start

      vi.advanceTimersByTime(1000)
      expect(contexts).toHaveLength(1) // not 2

      monitor.stop()
      expect(monitor.isRunning).toBe(false)
    })
  })

  describe('getState with no events', () => {
    it('returns empty state when no events recorded', () => {
      const monitor = new ActivityMonitor({})

      const state = monitor.getState()
      expect(state.currentApp).toBe('')
      expect(state.currentWindowTitle).toBe('')
      expect(state.isActive).toBe(false)
      expect(state.continuousWorkDurationMs).toBe(0)
      expect(state.recentApps).toEqual([])
      expect(state.lastActivityTimestamp).toBe(0)
      expect(state.isFullscreen).toBe(false)
    })
  })
})
