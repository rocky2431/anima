import type {
  EmotionEvent,
  IntimacyInteraction,
  PersonaEmotion,
  TriggerInput,
} from '@proj-airi/persona-engine'

import { useLogg } from '@guiiai/logg'
import {
  applyScoreChange,
  createEmotionActor,
  createIntimacyState,
  evaluateTriggers,
  generateResponse,
  mapToAnimaEmotion,
  T03_REST_REMINDER,
} from '@proj-airi/persona-engine'

const log = useLogg('persona-engine').useGlobalConfig()

/**
 * Map trigger names to emotion events for the xstate machine.
 */
const TRIGGER_EVENT_MAP: Record<string, EmotionEvent> = {
  'rest-reminder': { type: 'TRIGGER_CONCERN' },
}

/**
 * Setup the PersonaEngine service for the main process.
 * Manages the xstate emotion actor, intimacy tracking,
 * and proactive trigger evaluation.
 */
export function setupPersonaEngine() {
  const emotionActor = createEmotionActor()
  let intimacy = createIntimacyState()
  const lastTriggerTimes: Record<string, number> = {}
  const triggers = [T03_REST_REMINDER]

  /**
   * Evaluate proactive triggers against current activity context.
   * If a trigger fires, transitions the emotion machine and generates a response.
   */
  function evaluate(input: TriggerInput) {
    const now = Date.now()
    const result = evaluateTriggers(input, triggers, lastTriggerTimes, now)

    if (!result.triggered) {
      return null
    }

    lastTriggerTimes[result.triggerId] = now

    const event = TRIGGER_EVENT_MAP[result.triggerName]
    if (event) {
      emotionActor.send(event)
    }

    const currentEmotion = emotionActor.getSnapshot().value as PersonaEmotion
    const response = generateResponse(result, currentEmotion)
    const animaEmotion = mapToAnimaEmotion(currentEmotion)

    log.info('Proactive trigger fired', {
      triggerId: result.triggerId,
      emotion: currentEmotion,
      animaEmotion,
      message: response.message,
    })

    return response
  }

  function getEmotionState(): PersonaEmotion {
    return emotionActor.getSnapshot().value as PersonaEmotion
  }

  function getAnimaEmotion() {
    return mapToAnimaEmotion(getEmotionState())
  }

  function sendEmotionEvent(event: EmotionEvent) {
    emotionActor.send(event)
  }

  function recordInteraction(interaction: IntimacyInteraction) {
    intimacy = applyScoreChange(intimacy, interaction)
  }

  function getIntimacy() {
    return intimacy
  }

  function dispose() {
    emotionActor.stop()
  }

  return {
    evaluate,
    getEmotionState,
    getAnimaEmotion,
    sendEmotionEvent,
    recordInteraction,
    getIntimacy,
    dispose,
  }
}
