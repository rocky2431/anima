import type { DoNotDisturbConfig, DoNotDisturbState } from '../types'

import { describe, expect, it } from 'vitest'

import {
  canTrigger,
  createDefaultConfig,
  createDoNotDisturbState,
  isFrequencyExceeded,
  isInQuietHours,
  recordIgnore,
  recordTrigger,
  recordUserInteraction,
} from '../do-not-disturb'

const config: DoNotDisturbConfig = createDefaultConfig()

function stateWith(overrides?: Partial<DoNotDisturbState>): DoNotDisturbState {
  return { ...createDoNotDisturbState(), ...overrides }
}

// --- Quiet Hours ---

describe('isInQuietHours', () => {
  it('returns true during quiet hours (23:00-07:00)', () => {
    expect(isInQuietHours(23, config)).toBe(true)
    expect(isInQuietHours(0, config)).toBe(true)
    expect(isInQuietHours(3, config)).toBe(true)
    expect(isInQuietHours(6, config)).toBe(true)
  })

  it('returns false outside quiet hours', () => {
    expect(isInQuietHours(7, config)).toBe(false)
    expect(isInQuietHours(12, config)).toBe(false)
    expect(isInQuietHours(22, config)).toBe(false)
  })

  it('handles boundary: 7 AM is not quiet', () => {
    expect(isInQuietHours(7, config)).toBe(false)
  })

  it('handles boundary: 23:00 is quiet', () => {
    expect(isInQuietHours(23, config)).toBe(true)
  })
})

// --- Frequency Limits ---

describe('isFrequencyExceeded', () => {
  it('returns hourlyExceeded when 3 triggers in the last hour', () => {
    const now = Date.now()
    const state = stateWith({
      triggerTimestamps: [now - 100, now - 200, now - 300],
    })
    const result = isFrequencyExceeded(state, now, config)
    expect(result.hourlyExceeded).toBe(true)
  })

  it('does not count triggers older than 1 hour', () => {
    const now = Date.now()
    const oneHourAgo = now - 61 * 60 * 1000
    const state = stateWith({
      triggerTimestamps: [oneHourAgo, oneHourAgo - 100, now - 100],
    })
    const result = isFrequencyExceeded(state, now, config)
    expect(result.hourlyExceeded).toBe(false)
  })

  it('returns dailyExceeded when 15 triggers in the last 24 hours', () => {
    const now = Date.now()
    const timestamps = Array.from({ length: 15 }, (_, i) => now - i * 1000)
    const state = stateWith({ triggerTimestamps: timestamps })
    const result = isFrequencyExceeded(state, now, config)
    expect(result.dailyExceeded).toBe(true)
  })

  it('does not count triggers older than 24 hours for daily limit', () => {
    const now = Date.now()
    const dayAgo = now - 25 * 60 * 60 * 1000
    const timestamps = Array.from({ length: 14 }, (_, i) => dayAgo - i * 1000)
    timestamps.push(now - 100)
    const state = stateWith({ triggerTimestamps: timestamps })
    const result = isFrequencyExceeded(state, now, config)
    expect(result.dailyExceeded).toBe(false)
  })

  it('returns both false when under limits', () => {
    const now = Date.now()
    const state = stateWith({
      triggerTimestamps: [now - 1000],
    })
    const result = isFrequencyExceeded(state, now, config)
    expect(result.hourlyExceeded).toBe(false)
    expect(result.dailyExceeded).toBe(false)
  })
})

// --- canTrigger ---

describe('canTrigger', () => {
  it('allows normal triggers during active hours', () => {
    const state = createDoNotDisturbState()
    const result = canTrigger(state, 10, false, 'normal', Date.now(), config)
    expect(result).toBe(true)
  })

  it('blocks normal triggers during quiet hours', () => {
    const state = createDoNotDisturbState()
    const result = canTrigger(state, 1, false, 'normal', Date.now(), config)
    expect(result).toBe(false)
  })

  it('allows critical triggers during quiet hours', () => {
    const state = createDoNotDisturbState()
    const result = canTrigger(state, 1, false, 'critical', Date.now(), config)
    expect(result).toBe(true)
  })

  it('blocks all triggers in fullscreen mode', () => {
    const state = createDoNotDisturbState()
    const result = canTrigger(state, 10, true, 'critical', Date.now(), config)
    expect(result).toBe(false)
  })

  it('blocks when hourly frequency is exceeded', () => {
    const now = Date.now()
    const state = stateWith({
      triggerTimestamps: [now - 100, now - 200, now - 300],
    })
    const result = canTrigger(state, 10, false, 'normal', now, config)
    expect(result).toBe(false)
  })

  it('blocks when daily frequency is exceeded', () => {
    const now = Date.now()
    const timestamps = Array.from({ length: 15 }, (_, i) => now - (i + 1) * 60 * 1000)
    const state = stateWith({ triggerTimestamps: timestamps })
    const result = canTrigger(state, 10, false, 'normal', now, config)
    expect(result).toBe(false)
  })
})

// --- State Transitions ---

describe('recordTrigger', () => {
  it('adds timestamp to triggerTimestamps', () => {
    const state = createDoNotDisturbState()
    const now = Date.now()
    const next = recordTrigger(state, now)
    expect(next.triggerTimestamps).toContain(now)
  })

  it('resets consecutiveIgnores to 0', () => {
    const state = stateWith({ consecutiveIgnores: 5, cooldownMultiplier: 1.5 })
    const next = recordTrigger(state, Date.now())
    expect(next.consecutiveIgnores).toBe(0)
  })

  it('prunes timestamps older than 24 hours', () => {
    const now = Date.now()
    const old = now - 25 * 60 * 60 * 1000
    const state = stateWith({ triggerTimestamps: [old] })
    const next = recordTrigger(state, now)
    expect(next.triggerTimestamps).not.toContain(old)
    expect(next.triggerTimestamps).toHaveLength(1)
  })
})

describe('recordIgnore', () => {
  it('increments consecutiveIgnores', () => {
    const state = createDoNotDisturbState()
    const next = recordIgnore(state, config)
    expect(next.consecutiveIgnores).toBe(1)
  })

  it('applies backoff multiplier after threshold', () => {
    const state = stateWith({ consecutiveIgnores: 2, cooldownMultiplier: 1.0 })
    const next = recordIgnore(state, config)
    expect(next.consecutiveIgnores).toBe(3)
    expect(next.cooldownMultiplier).toBe(1.5)
  })

  it('stacks backoff multiplier on consecutive ignores', () => {
    const state = stateWith({ consecutiveIgnores: 5, cooldownMultiplier: 1.5 })
    const next = recordIgnore(state, config)
    expect(next.consecutiveIgnores).toBe(6)
    expect(next.cooldownMultiplier).toBe(1.5 * 1.5)
  })

  it('does not apply backoff before reaching threshold', () => {
    const state = stateWith({ consecutiveIgnores: 1, cooldownMultiplier: 1.0 })
    const next = recordIgnore(state, config)
    expect(next.cooldownMultiplier).toBe(1.0)
  })
})

describe('recordUserInteraction', () => {
  it('resets consecutiveIgnores and cooldownMultiplier', () => {
    const state = stateWith({
      consecutiveIgnores: 5,
      cooldownMultiplier: 3.375,
      triggerTimestamps: [Date.now()],
    })
    const next = recordUserInteraction(state)
    expect(next.consecutiveIgnores).toBe(0)
    expect(next.cooldownMultiplier).toBe(1.0)
    expect(next.triggerTimestamps).toEqual(state.triggerTimestamps)
  })
})

// --- Default Config ---

describe('createDefaultConfig', () => {
  it('returns correct defaults', () => {
    expect(config.maxPerHour).toBe(3)
    expect(config.maxPerDay).toBe(15)
    expect(config.quietHoursStart).toBe(23)
    expect(config.quietHoursEnd).toBe(7)
    expect(config.consecutiveIgnoresForBackoff).toBe(3)
    expect(config.backoffMultiplier).toBe(1.5)
  })
})
