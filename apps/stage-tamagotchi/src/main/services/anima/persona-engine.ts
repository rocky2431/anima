import {
  evaluateTriggers,
  generateResponse,
  INITIAL_EMOTION,
  T03_REST_REMINDER,
  transitionEmotion,
} from '@proj-airi/persona-engine'
import type {
  EmotionState,
  TriggerInput,
} from '@proj-airi/persona-engine'
import { useLogg } from '@guiiai/logg'

const log = useLogg('persona-engine').useGlobalConfig()

/**
 * Setup the PersonaEngine service for the main process.
 * Walking skeleton: only T03 rest-reminder trigger is active.
 */
export function setupPersonaEngine() {
  let currentEmotion: EmotionState = INITIAL_EMOTION
  const lastTriggerTimes: Record<string, number> = {}
  const triggers = [T03_REST_REMINDER]

  /**
   * Evaluate proactive triggers against current activity context.
   * If a trigger fires, generates a persona-driven response.
   */
  function evaluate(input: TriggerInput) {
    const now = Date.now()
    const result = evaluateTriggers(input, triggers, lastTriggerTimes, now)

    if (!result.triggered) {
      return null
    }

    lastTriggerTimes[result.triggerId] = now
    currentEmotion = transitionEmotion(currentEmotion, result)
    const response = generateResponse(result, currentEmotion)

    log.info('Proactive trigger fired', {
      triggerId: result.triggerId,
      emotion: currentEmotion,
      message: response.message,
    })

    return response
  }

  function getEmotionState() {
    return currentEmotion
  }

  return {
    evaluate,
    getEmotionState,
  }
}
