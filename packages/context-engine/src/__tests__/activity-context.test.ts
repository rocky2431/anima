import { describe, expect, it } from 'vitest'

import type { ActivityEvent } from '../types'
import { buildActivityContext } from '../activity/activity-context'

function makeEvent(timestamp: number, overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    timestamp,
    appName: 'VS Code',
    windowTitle: 'editor.ts',
    isFullscreen: false,
    ...overrides,
  }
}

describe('buildActivityContext', () => {
  it('returns zero context for empty events', () => {
    const ctx = buildActivityContext([])

    expect(ctx.continuousWorkDurationMs).toBe(0)
    expect(ctx.currentApp).toBe('')
    expect(ctx.currentWindowTitle).toBe('')
    expect(ctx.isFullscreen).toBe(false)
    expect(ctx.lastActivityTimestamp).toBe(0)
  })

  it('returns zero duration for a single event', () => {
    const now = Date.now()
    const ctx = buildActivityContext([makeEvent(now)])

    expect(ctx.continuousWorkDurationMs).toBe(0)
    expect(ctx.currentApp).toBe('VS Code')
    expect(ctx.lastActivityTimestamp).toBe(now)
  })

  it('calculates continuous duration from multiple events', () => {
    const base = 1_000_000
    const events = [
      makeEvent(base),
      makeEvent(base + 60_000),
      makeEvent(base + 120_000),
    ]

    const ctx = buildActivityContext(events)

    expect(ctx.continuousWorkDurationMs).toBe(120_000)
  })

  it('uses the last event for current app, window, and fullscreen', () => {
    const base = 1_000_000
    const events = [
      makeEvent(base, { appName: 'Chrome', windowTitle: 'Google', isFullscreen: false }),
      makeEvent(base + 60_000, { appName: 'Slack', windowTitle: 'General', isFullscreen: true }),
    ]

    const ctx = buildActivityContext(events)

    expect(ctx.currentApp).toBe('Slack')
    expect(ctx.currentWindowTitle).toBe('General')
    expect(ctx.isFullscreen).toBe(true)
    expect(ctx.lastActivityTimestamp).toBe(base + 60_000)
  })

  it('respects custom gap threshold', () => {
    const base = 1_000_000
    const events = [
      makeEvent(base),
      makeEvent(base + 120_000), // 2 min gap
      makeEvent(base + 180_000), // 1 min gap
    ]

    // With 1-minute threshold, the 2-min gap breaks the segment
    const ctx = buildActivityContext(events, 60_000)

    expect(ctx.continuousWorkDurationMs).toBe(60_000) // only last segment
  })

  it('resets duration when gap exceeds threshold', () => {
    const base = 1_000_000
    const GAP = 10 * 60 * 1000 // 10 minutes, exceeds default 5-min threshold
    const events = [
      makeEvent(base),
      makeEvent(base + 60_000),
      makeEvent(base + 60_000 + GAP), // big gap, new segment starts
      makeEvent(base + 60_000 + GAP + 30_000),
    ]

    const ctx = buildActivityContext(events)

    expect(ctx.continuousWorkDurationMs).toBe(30_000) // only the last segment
  })
})
