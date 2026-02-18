import type { IntimacyInteraction, IntimacyStage, IntimacyStageBoundary, IntimacyState } from './types'

/**
 * Score changes per interaction type.
 */
export const INTIMACY_SCORE_CHANGES: Record<IntimacyInteraction, number> = {
  conversation: 1,
  deepConversation: 3,
} as const

/**
 * Stage boundaries: score ranges that define each relationship stage.
 * Ordered from lowest to highest score.
 */
export const INTIMACY_STAGES: readonly IntimacyStageBoundary[] = [
  { stage: 'stranger', min: 0, max: 15 },
  { stage: 'acquaintance', min: 16, max: 35 },
  { stage: 'friend', min: 36, max: 60 },
  { stage: 'closeFriend', min: 61, max: 85 },
  { stage: 'soulmate', min: 86, max: 100 },
] as const

/**
 * Determine the intimacy stage for a given score.
 * Clamps score to [0, 100] range.
 *
 * @param score - Raw intimacy score
 * @returns The corresponding intimacy stage
 */
export function getStageForScore(score: number): IntimacyStage {
  const clamped = Math.max(0, Math.min(100, score))
  for (const boundary of INTIMACY_STAGES) {
    if (clamped >= boundary.min && clamped <= boundary.max) {
      return boundary.stage
    }
  }
  return 'soulmate'
}

/**
 * Create a new IntimacyState.
 * Pure factory function.
 *
 * @param initialScore - Starting score (default 0)
 * @returns A new IntimacyState with the correct stage computed
 */
export function createIntimacyState(initialScore: number = 0): IntimacyState {
  const clamped = Math.max(0, Math.min(100, initialScore))
  return {
    score: clamped,
    stage: getStageForScore(clamped),
  }
}

/**
 * Apply a score change from an interaction.
 * Returns a new IntimacyState (immutable).
 *
 * @param state - Current intimacy state
 * @param interaction - Type of interaction
 * @returns New intimacy state with updated score and stage
 */
export function applyScoreChange(
  state: IntimacyState,
  interaction: IntimacyInteraction,
): IntimacyState {
  const delta = INTIMACY_SCORE_CHANGES[interaction]
  const newScore = Math.max(0, Math.min(100, state.score + delta))
  return {
    score: newScore,
    stage: getStageForScore(newScore),
  }
}
