import { describe, expect, it } from 'vitest'

import type { ActivityEvent } from '../types'
import { calculateContinuousWorkDuration } from '../activity/duration'

const FIVE_MIN = 5 * 60 * 1000

function makeEvent(timestamp: number, overrides?: Partial<ActivityEvent>): ActivityEvent {
  return {
    timestamp,
    appName: 'VS Code',
    windowTitle: 'project - VS Code',
    isFullscreen: false,
    ...overrides,
  }
}

describe('calculateContinuousWorkDuration', () => {
  it('returns 0 for empty events array', () => {
    expect(calculateContinuousWorkDuration([])).toBe(0)
  })

  it('returns 0 for a single event', () => {
    const events = [makeEvent(1000)]
    expect(calculateContinuousWorkDuration(events)).toBe(0)
  })

  it('calculates correct duration for continuous events within gap threshold', () => {
    const start = Date.now()
    const events = [
      makeEvent(start),
      makeEvent(start + 60_000), // +1 min
      makeEvent(start + 120_000), // +2 min
      makeEvent(start + 180_000), // +3 min
    ]
    expect(calculateContinuousWorkDuration(events, FIVE_MIN)).toBe(180_000)
  })

  it('resets duration when gap exceeds threshold', () => {
    const start = Date.now()
    const events = [
      makeEvent(start),
      makeEvent(start + 60_000), // +1 min (continuous)
      makeEvent(start + 60_000 + 10 * 60_000), // +11 min (gap > 5 min → reset)
      makeEvent(start + 60_000 + 10 * 60_000 + 120_000), // +2 min from reset
    ]
    // After the gap, the continuous segment is only the last 2 events: 2 minutes
    expect(calculateContinuousWorkDuration(events, FIVE_MIN)).toBe(120_000)
  })

  it('uses the last continuous segment duration', () => {
    const start = Date.now()
    const events = [
      // First segment: 3 events spanning 4 minutes (continuous)
      makeEvent(start),
      makeEvent(start + 2 * 60_000), // +2 min
      makeEvent(start + 4 * 60_000), // +4 min
      // Gap of 10 minutes (breaks continuity)
      makeEvent(start + 14 * 60_000), // +14 min
      // Second segment: 2 events spanning 3 minutes (continuous)
      makeEvent(start + 17 * 60_000), // +17 min
    ]
    // Last continuous segment: events 4-5, spanning 3 minutes
    expect(calculateContinuousWorkDuration(events, FIVE_MIN)).toBe(3 * 60_000)
  })

  it('handles custom gap threshold', () => {
    const start = Date.now()
    const events = [
      makeEvent(start),
      makeEvent(start + 8 * 60_000), // +8 min gap
      makeEvent(start + 8 * 60_000 + 60_000), // +1 min
    ]
    // With 10-min threshold, all events are continuous → 9 min total
    expect(calculateContinuousWorkDuration(events, 10 * 60_000)).toBe(9 * 60_000)
    // With 5-min threshold, first gap breaks it → only 1 min
    expect(calculateContinuousWorkDuration(events, FIVE_MIN)).toBe(60_000)
  })
})
