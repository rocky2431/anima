import type { IntimacyStage, TriggerCondition, TriggerInput, TriggerResult } from './types'

/** Two hours in milliseconds */
export const TWO_HOURS_MS = 2 * 60 * 60 * 1000

/** Ninety minutes cooldown in milliseconds */
export const COOLDOWN_MS = 90 * 60 * 1000

/** One hour in milliseconds */
const ONE_HOUR_MS = 60 * 60 * 1000

/** Thirty minutes in milliseconds */
const THIRTY_MINUTES_MS = 30 * 60 * 1000

/** Twenty-four hours in milliseconds */
const TWENTY_FOUR_HOURS_MS = 24 * ONE_HOUR_MS

/**
 * Ordered intimacy stages from lowest to highest.
 * Used for comparing whether a user's intimacy meets a trigger's minimum.
 */
export const INTIMACY_ORDER: readonly IntimacyStage[] = [
  'stranger',
  'acquaintance',
  'friend',
  'closeFriend',
  'soulmate',
]

/**
 * Check whether the user's current intimacy stage meets or exceeds the required minimum.
 */
export function meetsIntimacyRequirement(current: IntimacyStage, required: IntimacyStage): boolean {
  const currentIdx = INTIMACY_ORDER.indexOf(current)
  const requiredIdx = INTIMACY_ORDER.indexOf(required)
  if (currentIdx === -1 || requiredIdx === -1) {
    return false
  }
  return currentIdx >= requiredIdx
}

/**
 * Known entertainment app names for T04 detection.
 */
const ENTERTAINMENT_APPS = new Set([
  'YouTube',
  'Netflix',
  'Spotify',
  'Bilibili',
  'Steam',
  'Discord',
  'Twitter',
  'TikTok',
  'WeChat',
  'Telegram',
])

function isEntertainmentApp(appName: string): boolean {
  return ENTERTAINMENT_APPS.has(appName)
}

// --- T01: Morning Greeting ---

export const T01_MORNING_GREETING: TriggerCondition = {
  id: 'T01',
  name: 'morning-greeting',
  check: (input: TriggerInput) => {
    return input.isFirstActivityToday && input.currentHour >= 6 && input.currentHour < 11
  },
  cooldownMs: TWENTY_FOUR_HOURS_MS,
  priority: 'normal',
  minIntimacy: 'stranger',
  suggestedEmotion: 'excited',
}

// --- T02: Noon Care ---

export const T02_NOON_CARE: TriggerCondition = {
  id: 'T02',
  name: 'noon-care',
  check: (input: TriggerInput) => {
    const timeInMinutes = input.currentHour * 60 + input.currentMinute
    const isLunchTime = timeInMinutes >= 11 * 60 + 30 && timeInMinutes <= 13 * 60 + 30
    return isLunchTime && input.continuousWorkDurationMs > TWO_HOURS_MS
  },
  cooldownMs: 4 * ONE_HOUR_MS,
  priority: 'normal',
  minIntimacy: 'acquaintance',
  suggestedEmotion: 'caring',
}

// --- T03: Rest Reminder ---

export const T03_REST_REMINDER: TriggerCondition = {
  id: 'T03',
  name: 'rest-reminder',
  check: (input: TriggerInput) => {
    return input.continuousWorkDurationMs > TWO_HOURS_MS
  },
  cooldownMs: COOLDOWN_MS,
  priority: 'high',
  minIntimacy: 'acquaintance',
  suggestedEmotion: 'caring',
}

// --- T04: Entertainment Switch ---

export const T04_ENTERTAINMENT_SWITCH: TriggerCondition = {
  id: 'T04',
  name: 'entertainment-switch',
  check: (input: TriggerInput) => {
    return input.previousAppCategory === 'work' && isEntertainmentApp(input.currentApp)
  },
  cooldownMs: 2 * ONE_HOUR_MS,
  priority: 'low',
  minIntimacy: 'friend',
  suggestedEmotion: 'curious',
}

// --- T05: Late Night Work ---

export const T05_LATE_NIGHT: TriggerCondition = {
  id: 'T05',
  name: 'late-night-work',
  check: (input: TriggerInput) => {
    const isLateNight = input.currentHour >= 23 || input.currentHour < 5
    return isLateNight && input.continuousWorkDurationMs > 0
  },
  cooldownMs: 3 * ONE_HOUR_MS,
  priority: 'high',
  minIntimacy: 'acquaintance',
  suggestedEmotion: 'worried',
}

// --- T06: Evening Summary ---

export const T06_EVENING_SUMMARY: TriggerCondition = {
  id: 'T06',
  name: 'evening-summary',
  check: (input: TriggerInput) => {
    return input.currentHour >= 20 && input.currentHour < 22 && input.hasActivityData
  },
  cooldownMs: TWENTY_FOUR_HOURS_MS,
  priority: 'normal',
  minIntimacy: 'friend',
  suggestedEmotion: 'caring',
}

// --- T07: Important Date ---

export const T07_IMPORTANT_DATE: TriggerCondition = {
  id: 'T07',
  name: 'important-date',
  check: (input: TriggerInput) => {
    return input.matchedImportantDate
  },
  cooldownMs: TWENTY_FOUR_HOURS_MS,
  priority: 'critical',
  minIntimacy: 'acquaintance',
  suggestedEmotion: 'excited',
}

// --- T08: Task Due ---

export const T08_TASK_DUE: TriggerCondition = {
  id: 'T08',
  name: 'task-due',
  check: (input: TriggerInput) => {
    return input.hasNearDeadlineTodos
  },
  cooldownMs: THIRTY_MINUTES_MS,
  priority: 'high',
  minIntimacy: 'stranger',
  suggestedEmotion: 'caring',
}

// --- T09: High Frequency Window Switch ---

export const T09_HIGH_FREQUENCY_SWITCH: TriggerCondition = {
  id: 'T09',
  name: 'high-frequency-switch',
  check: (input: TriggerInput) => {
    return input.windowSwitchesInLast5Min > 10
  },
  cooldownMs: ONE_HOUR_MS,
  priority: 'normal',
  minIntimacy: 'friend',
  suggestedEmotion: 'worried',
}

// --- T10: Big Task Complete ---

export const T10_BIG_TASK_COMPLETE: TriggerCondition = {
  id: 'T10',
  name: 'big-task-complete',
  check: (input: TriggerInput) => {
    return input.previousFocusDurationMs > ONE_HOUR_MS && input.previousAppCategory === 'work'
  },
  cooldownMs: 2 * ONE_HOUR_MS,
  priority: 'normal',
  minIntimacy: 'friend',
  suggestedEmotion: 'excited',
}

// --- T11: Return to Desktop ---

export const T11_RETURN_TO_DESKTOP: TriggerCondition = {
  id: 'T11',
  name: 'return-to-desktop',
  check: (input: TriggerInput) => {
    return input.timeSinceLastActivityMs > THIRTY_MINUTES_MS
  },
  cooldownMs: ONE_HOUR_MS,
  priority: 'low',
  minIntimacy: 'acquaintance',
  suggestedEmotion: 'excited',
}

/**
 * All 11 built-in trigger conditions, ordered by ID.
 */
export const ALL_TRIGGERS: readonly TriggerCondition[] = [
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
]

const NOT_TRIGGERED: TriggerResult = { triggered: false }

/**
 * Evaluate trigger conditions against the current activity context.
 * Respects cooldown periods, intimacy requirements, and fullscreen suppression.
 *
 * @param input - Current activity state
 * @param triggers - Array of trigger conditions to evaluate
 * @param lastTriggerTimes - Map of trigger ID -> last fire timestamp
 * @param now - Current timestamp in milliseconds
 * @param cooldownMultiplier - Multiplier for cooldown periods (default 1.0, increased by backoff)
 * @returns Result indicating whether any trigger fired
 */
export function evaluateTriggers(
  input: TriggerInput,
  triggers: TriggerCondition[],
  lastTriggerTimes: Record<string, number>,
  now: number,
  cooldownMultiplier: number = 1.0,
): TriggerResult {
  if (input.isFullscreen) {
    return NOT_TRIGGERED
  }

  for (const trigger of triggers) {
    if (!meetsIntimacyRequirement(input.intimacyStage, trigger.minIntimacy)) {
      continue
    }

    const effectiveCooldown = trigger.cooldownMs * cooldownMultiplier
    const lastFired = lastTriggerTimes[trigger.id]
    if (lastFired !== undefined && (now - lastFired) < effectiveCooldown) {
      continue
    }

    if (trigger.check(input)) {
      return {
        triggered: true,
        triggerId: trigger.id,
        triggerName: trigger.name,
        suggestedEmotion: trigger.suggestedEmotion,
      }
    }
  }

  return NOT_TRIGGERED
}
