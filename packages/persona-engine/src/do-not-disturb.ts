import type { DoNotDisturbConfig, DoNotDisturbState, TriggerPriority } from './types'

const ONE_HOUR_MS = 60 * 60 * 1000
const TWENTY_FOUR_HOURS_MS = 24 * ONE_HOUR_MS

/**
 * Create the default DoNotDisturb configuration.
 * Frequency: max 3/hour, 15/day.
 * Quiet hours: 23:00 - 07:00.
 * Progressive backoff: after 3 consecutive ignores, cooldown × 1.5.
 */
export function createDefaultConfig(): DoNotDisturbConfig {
  return {
    maxPerHour: 3,
    maxPerDay: 15,
    quietHoursStart: 23,
    quietHoursEnd: 7,
    consecutiveIgnoresForBackoff: 3,
    backoffMultiplier: 1.5,
  }
}

/**
 * Create a fresh DoNotDisturb state.
 */
export function createDoNotDisturbState(): DoNotDisturbState {
  return {
    triggerTimestamps: [],
    consecutiveIgnores: 0,
    cooldownMultiplier: 1.0,
  }
}

/**
 * Check if the given hour falls within the quiet hours window.
 * Quiet hours span midnight (e.g., 23:00 → 07:00).
 */
export function isInQuietHours(hour: number, config: DoNotDisturbConfig): boolean {
  if (config.quietHoursStart > config.quietHoursEnd) {
    return hour >= config.quietHoursStart || hour < config.quietHoursEnd
  }
  return hour >= config.quietHoursStart && hour < config.quietHoursEnd
}

/**
 * Check whether hourly or daily frequency limits have been exceeded.
 */
export function isFrequencyExceeded(
  state: DoNotDisturbState,
  now: number,
  config: DoNotDisturbConfig,
): { hourlyExceeded: boolean, dailyExceeded: boolean } {
  const oneHourAgo = now - ONE_HOUR_MS
  const oneDayAgo = now - TWENTY_FOUR_HOURS_MS

  const hourlyCount = state.triggerTimestamps.filter(t => t > oneHourAgo).length
  const dailyCount = state.triggerTimestamps.filter(t => t > oneDayAgo).length

  return {
    hourlyExceeded: hourlyCount >= config.maxPerHour,
    dailyExceeded: dailyCount >= config.maxPerDay,
  }
}

/**
 * Determine whether a trigger is allowed to fire given the current state.
 * Checks: fullscreen → quiet hours (critical bypasses) → frequency limits.
 */
export function canTrigger(
  state: DoNotDisturbState,
  currentHour: number,
  isFullscreen: boolean,
  priority: TriggerPriority,
  now: number,
  config: DoNotDisturbConfig,
): boolean {
  if (isFullscreen) {
    return false
  }

  if (isInQuietHours(currentHour, config) && priority !== 'critical') {
    return false
  }

  const freq = isFrequencyExceeded(state, now, config)
  if (freq.hourlyExceeded || freq.dailyExceeded) {
    return false
  }

  return true
}

/**
 * Record that a trigger has fired. Returns new state with:
 * - Timestamp appended (pruned to last 24h)
 * - consecutiveIgnores reset to 0
 */
export function recordTrigger(state: DoNotDisturbState, now: number): DoNotDisturbState {
  const oneDayAgo = now - TWENTY_FOUR_HOURS_MS
  const pruned = state.triggerTimestamps.filter(t => t > oneDayAgo)

  return {
    triggerTimestamps: [...pruned, now],
    consecutiveIgnores: 0,
    cooldownMultiplier: state.cooldownMultiplier,
  }
}

/**
 * Record that the user ignored a trigger.
 * After reaching the threshold, applies backoff multiplier to cooldowns.
 */
export function recordIgnore(state: DoNotDisturbState, config: DoNotDisturbConfig): DoNotDisturbState {
  const newIgnores = state.consecutiveIgnores + 1
  const shouldApplyBackoff = newIgnores >= config.consecutiveIgnoresForBackoff
    && newIgnores % config.consecutiveIgnoresForBackoff === 0

  return {
    triggerTimestamps: state.triggerTimestamps,
    consecutiveIgnores: newIgnores,
    cooldownMultiplier: shouldApplyBackoff
      ? state.cooldownMultiplier * config.backoffMultiplier
      : state.cooldownMultiplier,
  }
}

/**
 * Record that the user actively interacted.
 * Resets ignore counter and cooldown multiplier.
 */
export function recordUserInteraction(state: DoNotDisturbState): DoNotDisturbState {
  return {
    triggerTimestamps: state.triggerTimestamps,
    consecutiveIgnores: 0,
    cooldownMultiplier: 1.0,
  }
}
