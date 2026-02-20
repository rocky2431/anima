import type { TriggerInput } from '../types'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ALL_TRIGGERS,
  COOLDOWN_MS,
  evaluateTriggers,
  INTIMACY_ORDER,
  meetsIntimacyRequirement,
  TWO_HOURS_MS,
} from '../proactive-trigger'

/**
 * Factory function for TriggerInput with sensible defaults.
 * Each test overrides only the fields relevant to the trigger under test.
 */
function makeTriggerInput(overrides: Partial<TriggerInput> = {}): TriggerInput {
  return {
    continuousWorkDurationMs: 0,
    isFullscreen: false,
    currentApp: 'VS Code',
    currentHour: 14,
    currentMinute: 30,
    isFirstActivityToday: false,
    previousAppCategory: 'work',
    hasActivityData: true,
    matchedImportantDate: false,
    hasNearDeadlineTodos: false,
    windowSwitchesInLast5Min: 0,
    previousFocusDurationMs: 0,
    timeSinceLastActivityMs: 0,
    intimacyStage: 'soulmate',
    ...overrides,
  }
}

describe('phase 3 checkpoint: proactive trigger system', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('all 11 triggers can fire independently', () => {
    const triggerScenarios: Array<{
      id: string
      name: string
      input: Partial<TriggerInput>
    }> = [
      {
        id: 'T01',
        name: 'morning-greeting',
        input: { isFirstActivityToday: true, currentHour: 8, currentMinute: 0 },
      },
      {
        id: 'T02',
        name: 'noon-care',
        input: {
          currentHour: 12,
          currentMinute: 0,
          continuousWorkDurationMs: TWO_HOURS_MS + 1,
        },
      },
      {
        id: 'T03',
        name: 'rest-reminder',
        input: { continuousWorkDurationMs: TWO_HOURS_MS + 1 },
      },
      {
        id: 'T04',
        name: 'entertainment-switch',
        input: {
          previousAppCategory: 'work',
          currentApp: 'YouTube',
          intimacyStage: 'friend',
        },
      },
      {
        id: 'T05',
        name: 'late-night-work',
        input: { currentHour: 23, continuousWorkDurationMs: 1 },
      },
      {
        id: 'T06',
        name: 'evening-summary',
        input: {
          currentHour: 21,
          hasActivityData: true,
          intimacyStage: 'friend',
        },
      },
      {
        id: 'T07',
        name: 'important-date',
        input: { matchedImportantDate: true },
      },
      {
        id: 'T08',
        name: 'task-due',
        input: { hasNearDeadlineTodos: true },
      },
      {
        id: 'T09',
        name: 'high-frequency-switch',
        input: {
          windowSwitchesInLast5Min: 15,
          intimacyStage: 'friend',
        },
      },
      {
        id: 'T10',
        name: 'big-task-complete',
        input: {
          previousFocusDurationMs: 2 * 60 * 60 * 1000,
          previousAppCategory: 'work',
          intimacyStage: 'friend',
        },
      },
      {
        id: 'T11',
        name: 'return-to-desktop',
        input: { timeSinceLastActivityMs: 45 * 60 * 1000 },
      },
    ]

    for (const scenario of triggerScenarios) {
      it(`fires ${scenario.id} (${scenario.name}) with correct input`, () => {
        const now = Date.now()
        vi.setSystemTime(now)

        const input = makeTriggerInput(scenario.input)
        const result = evaluateTriggers(input, [...ALL_TRIGGERS], {}, now)

        expect(result.triggered).toBe(true)
        if (result.triggered) {
          expect(result.triggerId).toBe(scenario.id)
          expect(result.triggerName).toBe(scenario.name)
          expect(result.suggestedEmotion).toBeDefined()
        }
      })
    }

    it('verifies all 11 triggers are present in ALL_TRIGGERS', () => {
      expect(ALL_TRIGGERS).toHaveLength(11)
      const ids = ALL_TRIGGERS.map(t => t.id)
      for (let i = 1; i <= 11; i++) {
        expect(ids).toContain(`T${String(i).padStart(2, '0')}`)
      }
    })
  })

  describe('trigger evaluation with cooldown management', () => {
    it('respects cooldown: trigger does not re-fire within cooldown period', () => {
      const now = Date.now()
      vi.setSystemTime(now)

      const input = makeTriggerInput({
        continuousWorkDurationMs: TWO_HOURS_MS + 1,
        intimacyStage: 'acquaintance',
      })

      // First fire: T03 (rest-reminder) should trigger
      const result1 = evaluateTriggers(input, [...ALL_TRIGGERS], {}, now)
      expect(result1.triggered).toBe(true)
      if (!result1.triggered)
        return
      expect(result1.triggerId).toBe('T03')

      // Second fire within cooldown: should NOT trigger T03
      const lastTimes: Record<string, number> = { T03: now }
      const result2 = evaluateTriggers(input, [...ALL_TRIGGERS], lastTimes, now + 1000)
      // T03 is on cooldown, but T02 might fire if conditions match
      // With currentHour=14, T02 won't fire (needs 11:30-13:30)
      // So no trigger should fire
      if (result2.triggered) {
        expect(result2.triggerId).not.toBe('T03')
      }
    })

    it('fires trigger after cooldown expires', () => {
      const now = Date.now()
      vi.setSystemTime(now)

      const input = makeTriggerInput({
        continuousWorkDurationMs: TWO_HOURS_MS + 1,
        intimacyStage: 'acquaintance',
      })

      const lastTimes: Record<string, number> = { T03: now }

      // After cooldown expires
      const afterCooldown = now + COOLDOWN_MS + 1
      const result = evaluateTriggers(input, [...ALL_TRIGGERS], lastTimes, afterCooldown)
      expect(result.triggered).toBe(true)
      if (result.triggered) {
        expect(result.triggerId).toBe('T03')
      }
    })

    it('applies cooldown multiplier for progressive backoff', () => {
      const now = Date.now()
      vi.setSystemTime(now)

      const input = makeTriggerInput({
        continuousWorkDurationMs: TWO_HOURS_MS + 1,
        intimacyStage: 'acquaintance',
      })

      // With 1.5x multiplier, effective cooldown = COOLDOWN_MS * 1.5
      const lastTimes: Record<string, number> = { T03: now }
      const justAfterNormalCooldown = now + COOLDOWN_MS + 1

      // Should NOT fire with 1.5x multiplier (still within effective cooldown)
      const result = evaluateTriggers(input, [...ALL_TRIGGERS], lastTimes, justAfterNormalCooldown, 1.5)
      if (result.triggered) {
        expect(result.triggerId).not.toBe('T03')
      }

      // Should fire after effective cooldown (COOLDOWN_MS * 1.5)
      const afterEffective = now + Math.ceil(COOLDOWN_MS * 1.5) + 1
      const result2 = evaluateTriggers(input, [...ALL_TRIGGERS], lastTimes, afterEffective, 1.5)
      expect(result2.triggered).toBe(true)
      if (result2.triggered) {
        expect(result2.triggerId).toBe('T03')
      }
    })
  })

  describe('intimacy-based trigger gating', () => {
    it('blocks triggers that require higher intimacy than current', () => {
      const now = Date.now()
      vi.setSystemTime(now)

      // T04 requires 'friend' intimacy
      const input = makeTriggerInput({
        previousAppCategory: 'work',
        currentApp: 'YouTube',
        intimacyStage: 'acquaintance', // Below 'friend'
      })

      const result = evaluateTriggers(input, [...ALL_TRIGGERS], {}, now)
      if (result.triggered) {
        expect(result.triggerId).not.toBe('T04')
      }
    })

    it('allows triggers when intimacy meets minimum requirement', () => {
      const now = Date.now()
      vi.setSystemTime(now)

      // T04 requires 'friend', user is 'friend'
      const input = makeTriggerInput({
        previousAppCategory: 'work',
        currentApp: 'YouTube',
        intimacyStage: 'friend',
      })

      const result = evaluateTriggers(input, [...ALL_TRIGGERS], {}, now)
      expect(result.triggered).toBe(true)
      if (result.triggered) {
        expect(result.triggerId).toBe('T04')
      }
    })

    it('validates all intimacy stages are ordered correctly', () => {
      expect(INTIMACY_ORDER).toEqual([
        'stranger',
        'acquaintance',
        'friend',
        'closeFriend',
        'soulmate',
      ])

      // Each stage meets its own requirement
      for (const stage of INTIMACY_ORDER) {
        expect(meetsIntimacyRequirement(stage, stage)).toBe(true)
      }

      // Higher stages meet lower requirements
      expect(meetsIntimacyRequirement('soulmate', 'stranger')).toBe(true)
      expect(meetsIntimacyRequirement('friend', 'acquaintance')).toBe(true)

      // Lower stages don't meet higher requirements
      expect(meetsIntimacyRequirement('stranger', 'soulmate')).toBe(false)
      expect(meetsIntimacyRequirement('acquaintance', 'friend')).toBe(false)
    })
  })

  describe('fullscreen suppression', () => {
    it('suppresses all triggers when user is in fullscreen', () => {
      const now = Date.now()
      vi.setSystemTime(now)

      // Provide conditions that would fire multiple triggers
      const input = makeTriggerInput({
        isFullscreen: true,
        continuousWorkDurationMs: TWO_HOURS_MS + 1,
        hasNearDeadlineTodos: true,
        matchedImportantDate: true,
        intimacyStage: 'soulmate',
      })

      const result = evaluateTriggers(input, [...ALL_TRIGGERS], {}, now)
      expect(result.triggered).toBe(false)
    })
  })

  describe('trigger priority ordering', () => {
    it('evaluates triggers in order and returns first match', () => {
      const now = Date.now()
      vi.setSystemTime(now)

      // T07 (important-date, critical priority) should fire before T08 (task-due, high priority)
      // Because T07 comes before T08 in ALL_TRIGGERS order
      const input = makeTriggerInput({
        matchedImportantDate: true,
        hasNearDeadlineTodos: true,
        intimacyStage: 'soulmate',
      })

      const result = evaluateTriggers(input, [...ALL_TRIGGERS], {}, now)
      expect(result.triggered).toBe(true)
      if (result.triggered) {
        // T07 should be evaluated before T08
        expect(result.triggerId).toBe('T07')
      }
    })
  })

  describe('trigger suggested emotions', () => {
    it('each trigger has a valid emotion suggestion', () => {
      const validEmotions = new Set(['idle', 'curious', 'caring', 'worried', 'sleepy', 'excited'])

      for (const trigger of ALL_TRIGGERS) {
        expect(validEmotions.has(trigger.suggestedEmotion)).toBe(true)
      }
    })

    it('returns suggested emotion in result when triggered', () => {
      const now = Date.now()
      vi.setSystemTime(now)

      const input = makeTriggerInput({
        isFirstActivityToday: true,
        currentHour: 8,
      })

      const result = evaluateTriggers(input, [...ALL_TRIGGERS], {}, now)
      expect(result.triggered).toBe(true)
      if (result.triggered) {
        expect(result.suggestedEmotion).toBe('excited') // T01 suggests 'excited'
      }
    })
  })
})
