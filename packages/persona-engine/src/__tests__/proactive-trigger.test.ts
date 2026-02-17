import { describe, expect, it } from 'vitest'

import type { TriggerInput } from '../types'
import { COOLDOWN_MS, evaluateTriggers, T03_REST_REMINDER, TWO_HOURS_MS } from '../proactive-trigger'

function makeTriggerInput(overrides?: Partial<TriggerInput>): TriggerInput {
  return {
    continuousWorkDurationMs: 0,
    isFullscreen: false,
    currentApp: 'VS Code',
    ...overrides,
  }
}

describe('T03_REST_REMINDER condition', () => {
  it('fires when continuous work exceeds 2 hours', () => {
    const input = makeTriggerInput({
      continuousWorkDurationMs: TWO_HOURS_MS + 1,
    })
    expect(T03_REST_REMINDER.check(input)).toBe(true)
  })

  it('does not fire when continuous work is under 2 hours', () => {
    const input = makeTriggerInput({
      continuousWorkDurationMs: TWO_HOURS_MS - 1,
    })
    expect(T03_REST_REMINDER.check(input)).toBe(false)
  })

  it('does not fire when continuous work is exactly 2 hours', () => {
    const input = makeTriggerInput({
      continuousWorkDurationMs: TWO_HOURS_MS,
    })
    expect(T03_REST_REMINDER.check(input)).toBe(false)
  })

  it('does not fire when user is in fullscreen', () => {
    const input = makeTriggerInput({
      continuousWorkDurationMs: TWO_HOURS_MS + 1,
      isFullscreen: true,
    })
    expect(T03_REST_REMINDER.check(input)).toBe(false)
  })

  it('has a 90-minute cooldown', () => {
    expect(T03_REST_REMINDER.cooldownMs).toBe(COOLDOWN_MS)
    expect(COOLDOWN_MS).toBe(90 * 60 * 1000)
  })
})

describe('evaluateTriggers', () => {
  const triggers = [T03_REST_REMINDER]

  it('returns triggered=true when a condition is met and not in cooldown', () => {
    const input = makeTriggerInput({
      continuousWorkDurationMs: TWO_HOURS_MS + 60_000,
    })
    const now = Date.now()

    const result = evaluateTriggers(input, triggers, {}, now)

    expect(result.triggered).toBe(true)
    if (result.triggered) {
      expect(result.triggerId).toBe('T03')
      expect(result.triggerName).toBe('rest-reminder')
    }
  })

  it('returns triggered=false when no condition is met', () => {
    const input = makeTriggerInput({
      continuousWorkDurationMs: 30 * 60 * 1000, // 30 min
    })
    const now = Date.now()

    const result = evaluateTriggers(input, triggers, {}, now)

    expect(result.triggered).toBe(false)
  })

  it('returns triggered=false during cooldown period', () => {
    const input = makeTriggerInput({
      continuousWorkDurationMs: TWO_HOURS_MS + 60_000,
    })
    const now = Date.now()
    const lastTriggerTimes = {
      T03: now - 30 * 60 * 1000, // 30 min ago (within 90 min cooldown)
    }

    const result = evaluateTriggers(input, triggers, lastTriggerTimes, now)

    expect(result.triggered).toBe(false)
  })

  it('returns triggered=true after cooldown period has elapsed', () => {
    const input = makeTriggerInput({
      continuousWorkDurationMs: TWO_HOURS_MS + 60_000,
    })
    const now = Date.now()
    const lastTriggerTimes = {
      T03: now - COOLDOWN_MS - 1, // Just past cooldown
    }

    const result = evaluateTriggers(input, triggers, lastTriggerTimes, now)

    expect(result.triggered).toBe(true)
    if (result.triggered) {
      expect(result.triggerId).toBe('T03')
    }
  })

  it('returns triggered=false when trigger list is empty', () => {
    const input = makeTriggerInput({
      continuousWorkDurationMs: TWO_HOURS_MS + 60_000,
    })

    const result = evaluateTriggers(input, [], {}, Date.now())

    expect(result.triggered).toBe(false)
  })
})
