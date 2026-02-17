import type { TriggerCondition, TriggerInput, TriggerResult } from './types'

/** Two hours in milliseconds */
const TWO_HOURS_MS = 2 * 60 * 60 * 1000

/** Ninety minutes cooldown in milliseconds */
const COOLDOWN_MS = 90 * 60 * 1000

/**
 * Built-in trigger T03: Rest reminder.
 * Fires when user has been working continuously for >2 hours.
 * Suppressed when user is in fullscreen mode.
 */
export const T03_REST_REMINDER: TriggerCondition = {
  id: 'T03',
  name: 'rest-reminder',
  check: (input: TriggerInput) => {
    if (input.isFullscreen) {
      return false
    }
    return input.continuousWorkDurationMs > TWO_HOURS_MS
  },
  cooldownMs: COOLDOWN_MS,
}

const NOT_TRIGGERED: TriggerResult = { triggered: false }

/**
 * Evaluate trigger conditions against the current activity context.
 * Respects cooldown periods to prevent repeated triggering.
 *
 * @param input - Current activity state
 * @param triggers - Array of trigger conditions to evaluate
 * @param lastTriggerTimes - Map of trigger ID -> last fire timestamp
 * @param now - Current timestamp in milliseconds
 * @returns Result indicating whether any trigger fired
 */
export function evaluateTriggers(
  input: TriggerInput,
  triggers: TriggerCondition[],
  lastTriggerTimes: Record<string, number>,
  now: number,
): TriggerResult {
  for (const trigger of triggers) {
    const lastFired = lastTriggerTimes[trigger.id]
    if (lastFired !== undefined && (now - lastFired) < trigger.cooldownMs) {
      continue
    }

    if (trigger.check(input)) {
      return {
        triggered: true,
        triggerId: trigger.id,
        triggerName: trigger.name,
      }
    }
  }

  return NOT_TRIGGERED
}

export { TWO_HOURS_MS, COOLDOWN_MS }
