import type { EmotionState, TriggerResult } from './types'

/**
 * The initial/default emotion state.
 */
export const INITIAL_EMOTION: EmotionState = 'neutral'

/**
 * Maps trigger names to the emotion states they induce.
 */
const TRIGGER_EMOTION_MAP: Record<string, EmotionState> = {
  'rest-reminder': 'caring',
}

/**
 * Transition the emotion state based on a trigger result.
 * Pure function: given current state and trigger, returns new state.
 *
 * @param currentState - Current emotion state
 * @param trigger - The trigger result that may affect emotion
 * @returns New emotion state after transition
 */
export function transitionEmotion(
  currentState: EmotionState,
  trigger: TriggerResult,
): EmotionState {
  if (!trigger.triggered) {
    return currentState
  }

  return TRIGGER_EMOTION_MAP[trigger.triggerName] ?? currentState
}
