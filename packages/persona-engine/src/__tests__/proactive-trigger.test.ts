import type { TriggerInput } from '../types'

import { describe, expect, it } from 'vitest'

import {
  ALL_TRIGGERS,
  COOLDOWN_MS,
  evaluateTriggers,
  meetsIntimacyRequirement,
  T01_MORNING_GREETING,
  T02_NOON_CARE,
  T03_REST_REMINDER,
  T04_ENTERTAINMENT_SWITCH,
  T05_LATE_NIGHT,
  T06_EVENING_SUMMARY,
  T07_IMPORTANT_DATE,
  T08_TASK_DUE,
  T09_HIGH_FREQUENCY_SWITCH,
  T10_BIG_TASK_COMPLETE,
  T11_RETURN_TO_DESKTOP,
  TWO_HOURS_MS,
} from '../proactive-trigger'

function makeTriggerInput(overrides?: Partial<TriggerInput>): TriggerInput {
  return {
    continuousWorkDurationMs: 0,
    isFullscreen: false,
    currentApp: 'VS Code',
    currentHour: 10,
    currentMinute: 0,
    isFirstActivityToday: false,
    previousAppCategory: 'work',
    hasActivityData: false,
    matchedImportantDate: false,
    hasNearDeadlineTodos: false,
    windowSwitchesInLast5Min: 0,
    previousFocusDurationMs: 0,
    timeSinceLastActivityMs: 0,
    intimacyStage: 'soulmate',
    ...overrides,
  }
}

// --- T01: Morning Greeting ---

describe('t01_MORNING_GREETING', () => {
  it('fires on first activity of the day between 6-11 AM', () => {
    const input = makeTriggerInput({
      isFirstActivityToday: true,
      currentHour: 8,
    })
    expect(T01_MORNING_GREETING.check(input)).toBe(true)
  })

  it('fires at boundary: 6 AM', () => {
    const input = makeTriggerInput({
      isFirstActivityToday: true,
      currentHour: 6,
    })
    expect(T01_MORNING_GREETING.check(input)).toBe(true)
  })

  it('does not fire at 11 AM (exclusive upper bound)', () => {
    const input = makeTriggerInput({
      isFirstActivityToday: true,
      currentHour: 11,
    })
    expect(T01_MORNING_GREETING.check(input)).toBe(false)
  })

  it('does not fire before 6 AM', () => {
    const input = makeTriggerInput({
      isFirstActivityToday: true,
      currentHour: 5,
    })
    expect(T01_MORNING_GREETING.check(input)).toBe(false)
  })

  it('does not fire if not first activity today', () => {
    const input = makeTriggerInput({
      isFirstActivityToday: false,
      currentHour: 8,
    })
    expect(T01_MORNING_GREETING.check(input)).toBe(false)
  })

  it('has 24h cooldown and stranger minimum intimacy', () => {
    expect(T01_MORNING_GREETING.cooldownMs).toBe(24 * 60 * 60 * 1000)
    expect(T01_MORNING_GREETING.minIntimacy).toBe('stranger')
    expect(T01_MORNING_GREETING.priority).toBe('normal')
    expect(T01_MORNING_GREETING.suggestedEmotion).toBe('excited')
  })
})

// --- T02: Noon Care ---

describe('t02_NOON_CARE', () => {
  it('fires when working >2h during 11:30-13:30', () => {
    const input = makeTriggerInput({
      continuousWorkDurationMs: TWO_HOURS_MS + 1,
      currentHour: 12,
      currentMinute: 0,
    })
    expect(T02_NOON_CARE.check(input)).toBe(true)
  })

  it('fires at boundary: 11:30', () => {
    const input = makeTriggerInput({
      continuousWorkDurationMs: TWO_HOURS_MS + 1,
      currentHour: 11,
      currentMinute: 30,
    })
    expect(T02_NOON_CARE.check(input)).toBe(true)
  })

  it('does not fire before 11:30', () => {
    const input = makeTriggerInput({
      continuousWorkDurationMs: TWO_HOURS_MS + 1,
      currentHour: 11,
      currentMinute: 29,
    })
    expect(T02_NOON_CARE.check(input)).toBe(false)
  })

  it('fires at boundary: 13:30 (inclusive)', () => {
    const input = makeTriggerInput({
      continuousWorkDurationMs: TWO_HOURS_MS + 1,
      currentHour: 13,
      currentMinute: 30,
    })
    expect(T02_NOON_CARE.check(input)).toBe(true)
  })

  it('does not fire after 13:30', () => {
    const input = makeTriggerInput({
      continuousWorkDurationMs: TWO_HOURS_MS + 1,
      currentHour: 13,
      currentMinute: 31,
    })
    expect(T02_NOON_CARE.check(input)).toBe(false)
  })

  it('does not fire if work duration is under 2 hours', () => {
    const input = makeTriggerInput({
      continuousWorkDurationMs: TWO_HOURS_MS - 1,
      currentHour: 12,
      currentMinute: 0,
    })
    expect(T02_NOON_CARE.check(input)).toBe(false)
  })

  it('has 4h cooldown and acquaintance minimum intimacy', () => {
    expect(T02_NOON_CARE.cooldownMs).toBe(4 * 60 * 60 * 1000)
    expect(T02_NOON_CARE.minIntimacy).toBe('acquaintance')
  })
})

// --- T03: Rest Reminder (existing) ---

describe('t03_REST_REMINDER condition', () => {
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

  it('has a 90-minute cooldown', () => {
    expect(T03_REST_REMINDER.cooldownMs).toBe(COOLDOWN_MS)
    expect(COOLDOWN_MS).toBe(90 * 60 * 1000)
  })

  it('has acquaintance minimum intimacy and high priority', () => {
    expect(T03_REST_REMINDER.minIntimacy).toBe('acquaintance')
    expect(T03_REST_REMINDER.priority).toBe('high')
  })
})

// --- T04: Entertainment Switch ---

describe('t04_ENTERTAINMENT_SWITCH', () => {
  it('fires when switching from work to entertainment app', () => {
    const input = makeTriggerInput({
      previousAppCategory: 'work',
      currentApp: 'YouTube',
    })
    // T04 check looks at previousAppCategory being 'work' and current being entertainment
    expect(T04_ENTERTAINMENT_SWITCH.check(input)).toBe(true)
  })

  it('does not fire when staying in work apps', () => {
    const input = makeTriggerInput({
      previousAppCategory: 'work',
      currentApp: 'VS Code',
    })
    expect(T04_ENTERTAINMENT_SWITCH.check(input)).toBe(false)
  })

  it('has 2h cooldown and friend minimum intimacy', () => {
    expect(T04_ENTERTAINMENT_SWITCH.cooldownMs).toBe(2 * 60 * 60 * 1000)
    expect(T04_ENTERTAINMENT_SWITCH.minIntimacy).toBe('friend')
    expect(T04_ENTERTAINMENT_SWITCH.priority).toBe('low')
  })
})

// --- T05: Late Night Work ---

describe('t05_LATE_NIGHT', () => {
  it('fires when working after 23:00', () => {
    const input = makeTriggerInput({
      currentHour: 23,
      continuousWorkDurationMs: 10 * 60 * 1000,
    })
    expect(T05_LATE_NIGHT.check(input)).toBe(true)
  })

  it('fires at midnight', () => {
    const input = makeTriggerInput({
      currentHour: 0,
      continuousWorkDurationMs: 10 * 60 * 1000,
    })
    expect(T05_LATE_NIGHT.check(input)).toBe(true)
  })

  it('does not fire before 23:00', () => {
    const input = makeTriggerInput({
      currentHour: 22,
      continuousWorkDurationMs: 10 * 60 * 1000,
    })
    expect(T05_LATE_NIGHT.check(input)).toBe(false)
  })

  it('does not fire if not actively working', () => {
    const input = makeTriggerInput({
      currentHour: 23,
      continuousWorkDurationMs: 0,
    })
    expect(T05_LATE_NIGHT.check(input)).toBe(false)
  })

  it('has 3h cooldown and acquaintance minimum intimacy', () => {
    expect(T05_LATE_NIGHT.cooldownMs).toBe(3 * 60 * 60 * 1000)
    expect(T05_LATE_NIGHT.minIntimacy).toBe('acquaintance')
    expect(T05_LATE_NIGHT.priority).toBe('high')
  })
})

// --- T06: Evening Summary ---

describe('t06_EVENING_SUMMARY', () => {
  it('fires during 20-22 with activity data', () => {
    const input = makeTriggerInput({
      currentHour: 21,
      hasActivityData: true,
    })
    expect(T06_EVENING_SUMMARY.check(input)).toBe(true)
  })

  it('fires at boundary: 20:00', () => {
    const input = makeTriggerInput({
      currentHour: 20,
      hasActivityData: true,
    })
    expect(T06_EVENING_SUMMARY.check(input)).toBe(true)
  })

  it('does not fire at 22:00 (exclusive)', () => {
    const input = makeTriggerInput({
      currentHour: 22,
      hasActivityData: true,
    })
    expect(T06_EVENING_SUMMARY.check(input)).toBe(false)
  })

  it('does not fire without activity data', () => {
    const input = makeTriggerInput({
      currentHour: 21,
      hasActivityData: false,
    })
    expect(T06_EVENING_SUMMARY.check(input)).toBe(false)
  })

  it('has 24h cooldown and friend minimum intimacy', () => {
    expect(T06_EVENING_SUMMARY.cooldownMs).toBe(24 * 60 * 60 * 1000)
    expect(T06_EVENING_SUMMARY.minIntimacy).toBe('friend')
  })
})

// --- T07: Important Date ---

describe('t07_IMPORTANT_DATE', () => {
  it('fires when an important date matches', () => {
    const input = makeTriggerInput({
      matchedImportantDate: true,
    })
    expect(T07_IMPORTANT_DATE.check(input)).toBe(true)
  })

  it('does not fire when no important date matches', () => {
    const input = makeTriggerInput({
      matchedImportantDate: false,
    })
    expect(T07_IMPORTANT_DATE.check(input)).toBe(false)
  })

  it('has critical priority and 24h cooldown', () => {
    expect(T07_IMPORTANT_DATE.priority).toBe('critical')
    expect(T07_IMPORTANT_DATE.cooldownMs).toBe(24 * 60 * 60 * 1000)
    expect(T07_IMPORTANT_DATE.minIntimacy).toBe('acquaintance')
  })
})

// --- T08: Task Due ---

describe('t08_TASK_DUE', () => {
  it('fires when tasks are near deadline', () => {
    const input = makeTriggerInput({
      hasNearDeadlineTodos: true,
    })
    expect(T08_TASK_DUE.check(input)).toBe(true)
  })

  it('does not fire when no tasks are near deadline', () => {
    const input = makeTriggerInput({
      hasNearDeadlineTodos: false,
    })
    expect(T08_TASK_DUE.check(input)).toBe(false)
  })

  it('has 30min cooldown and stranger minimum intimacy', () => {
    expect(T08_TASK_DUE.cooldownMs).toBe(30 * 60 * 1000)
    expect(T08_TASK_DUE.minIntimacy).toBe('stranger')
    expect(T08_TASK_DUE.priority).toBe('high')
  })
})

// --- T09: High Frequency Window Switch ---

describe('t09_HIGH_FREQUENCY_SWITCH', () => {
  it('fires when window switches exceed 10 in 5 minutes', () => {
    const input = makeTriggerInput({
      windowSwitchesInLast5Min: 11,
    })
    expect(T09_HIGH_FREQUENCY_SWITCH.check(input)).toBe(true)
  })

  it('does not fire at exactly 10 switches', () => {
    const input = makeTriggerInput({
      windowSwitchesInLast5Min: 10,
    })
    expect(T09_HIGH_FREQUENCY_SWITCH.check(input)).toBe(false)
  })

  it('has 1h cooldown and friend minimum intimacy', () => {
    expect(T09_HIGH_FREQUENCY_SWITCH.cooldownMs).toBe(60 * 60 * 1000)
    expect(T09_HIGH_FREQUENCY_SWITCH.minIntimacy).toBe('friend')
  })
})

// --- T10: Big Task Complete ---

describe('t10_BIG_TASK_COMPLETE', () => {
  it('fires after a long focus session (>1h) followed by app switch', () => {
    const input = makeTriggerInput({
      previousFocusDurationMs: 61 * 60 * 1000,
      previousAppCategory: 'work',
    })
    expect(T10_BIG_TASK_COMPLETE.check(input)).toBe(true)
  })

  it('does not fire for short focus sessions', () => {
    const input = makeTriggerInput({
      previousFocusDurationMs: 30 * 60 * 1000,
      previousAppCategory: 'work',
    })
    expect(T10_BIG_TASK_COMPLETE.check(input)).toBe(false)
  })

  it('has 2h cooldown and friend minimum intimacy', () => {
    expect(T10_BIG_TASK_COMPLETE.cooldownMs).toBe(2 * 60 * 60 * 1000)
    expect(T10_BIG_TASK_COMPLETE.minIntimacy).toBe('friend')
  })
})

// --- T11: Return to Desktop ---

describe('t11_RETURN_TO_DESKTOP', () => {
  it('fires when returning after >30 min away', () => {
    const input = makeTriggerInput({
      timeSinceLastActivityMs: 31 * 60 * 1000,
    })
    expect(T11_RETURN_TO_DESKTOP.check(input)).toBe(true)
  })

  it('does not fire if away for less than 30 min', () => {
    const input = makeTriggerInput({
      timeSinceLastActivityMs: 29 * 60 * 1000,
    })
    expect(T11_RETURN_TO_DESKTOP.check(input)).toBe(false)
  })

  it('has 1h cooldown and acquaintance minimum intimacy', () => {
    expect(T11_RETURN_TO_DESKTOP.cooldownMs).toBe(60 * 60 * 1000)
    expect(T11_RETURN_TO_DESKTOP.minIntimacy).toBe('acquaintance')
    expect(T11_RETURN_TO_DESKTOP.priority).toBe('low')
  })
})

// --- ALL_TRIGGERS ---

describe('aLL_TRIGGERS', () => {
  it('contains exactly 11 trigger conditions', () => {
    expect(ALL_TRIGGERS).toHaveLength(11)
  })

  it('has unique IDs for all triggers', () => {
    const ids = ALL_TRIGGERS.map(t => t.id)
    expect(new Set(ids).size).toBe(11)
  })
})

// --- Intimacy Requirement ---

describe('meetsIntimacyRequirement', () => {
  it('stranger meets stranger requirement', () => {
    expect(meetsIntimacyRequirement('stranger', 'stranger')).toBe(true)
  })

  it('soulmate meets all requirements', () => {
    expect(meetsIntimacyRequirement('soulmate', 'stranger')).toBe(true)
    expect(meetsIntimacyRequirement('soulmate', 'acquaintance')).toBe(true)
    expect(meetsIntimacyRequirement('soulmate', 'friend')).toBe(true)
    expect(meetsIntimacyRequirement('soulmate', 'closeFriend')).toBe(true)
    expect(meetsIntimacyRequirement('soulmate', 'soulmate')).toBe(true)
  })

  it('stranger does not meet acquaintance requirement', () => {
    expect(meetsIntimacyRequirement('stranger', 'acquaintance')).toBe(false)
  })

  it('friend meets acquaintance requirement', () => {
    expect(meetsIntimacyRequirement('friend', 'acquaintance')).toBe(true)
  })
})

// --- evaluateTriggers ---

describe('evaluateTriggers', () => {
  const triggers = [T03_REST_REMINDER]

  it('returns triggered=true when a condition is met and not in cooldown', () => {
    const input = makeTriggerInput({
      continuousWorkDurationMs: TWO_HOURS_MS + 60_000,
      intimacyStage: 'acquaintance',
    })
    const now = Date.now()

    const result = evaluateTriggers(input, triggers, {}, now)

    expect(result.triggered).toBe(true)
    if (result.triggered) {
      expect(result.triggerId).toBe('T03')
      expect(result.triggerName).toBe('rest-reminder')
      expect(result.suggestedEmotion).toBe('caring')
    }
  })

  it('returns triggered=false when no condition is met', () => {
    const input = makeTriggerInput({
      continuousWorkDurationMs: 30 * 60 * 1000,
    })
    const now = Date.now()

    const result = evaluateTriggers(input, triggers, {}, now)

    expect(result.triggered).toBe(false)
  })

  it('returns triggered=false during cooldown period', () => {
    const input = makeTriggerInput({
      continuousWorkDurationMs: TWO_HOURS_MS + 60_000,
      intimacyStage: 'acquaintance',
    })
    const now = Date.now()
    const lastTriggerTimes = {
      T03: now - 30 * 60 * 1000,
    }

    const result = evaluateTriggers(input, triggers, lastTriggerTimes, now)

    expect(result.triggered).toBe(false)
  })

  it('returns triggered=true after cooldown period has elapsed', () => {
    const input = makeTriggerInput({
      continuousWorkDurationMs: TWO_HOURS_MS + 60_000,
      intimacyStage: 'acquaintance',
    })
    const now = Date.now()
    const lastTriggerTimes = {
      T03: now - COOLDOWN_MS - 1,
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

  it('skips triggers when intimacy requirement is not met', () => {
    const input = makeTriggerInput({
      continuousWorkDurationMs: TWO_HOURS_MS + 60_000,
      intimacyStage: 'stranger',
    })
    const now = Date.now()

    const result = evaluateTriggers(input, triggers, {}, now)

    expect(result.triggered).toBe(false)
  })

  it('skips triggers when user is in fullscreen', () => {
    const input = makeTriggerInput({
      continuousWorkDurationMs: TWO_HOURS_MS + 60_000,
      isFullscreen: true,
      intimacyStage: 'acquaintance',
    })
    const now = Date.now()

    const result = evaluateTriggers(input, triggers, {}, now)

    expect(result.triggered).toBe(false)
  })

  it('applies cooldown multiplier when provided', () => {
    const input = makeTriggerInput({
      continuousWorkDurationMs: TWO_HOURS_MS + 60_000,
      intimacyStage: 'acquaintance',
    })
    const now = Date.now()
    const lastTriggerTimes = {
      T03: now - COOLDOWN_MS - 1,
    }

    const resultNormal = evaluateTriggers(input, triggers, lastTriggerTimes, now, 1.0)
    expect(resultNormal.triggered).toBe(true)

    const resultBackoff = evaluateTriggers(input, triggers, lastTriggerTimes, now, 1.5)
    expect(resultBackoff.triggered).toBe(false)
  })
})
