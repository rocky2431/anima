export { mapToAnimaEmotion } from './emotion-bridge'

export { createEmotionActor, emotionMachine } from './emotion-state-machine'
export type { EmotionActor, EmotionEvent } from './emotion-state-machine'

export {
  applyScoreChange,
  createIntimacyState,
  getStageForScore,
  INTIMACY_SCORE_CHANGES,
  INTIMACY_STAGES,
} from './intimacy-tracker'

export { getPersonaTemplate, PERSONA_TEMPLATES } from './persona-template'

export { evaluateTriggers, T03_REST_REMINDER } from './proactive-trigger'

export { generateResponse } from './response-generator'
export type {
  AnimaEmotionName,
  AnimaEmotionPayload,
  EmotionState,
  IntimacyInteraction,
  IntimacyStage,
  IntimacyStageBoundary,
  IntimacyState,
  PersonaEmotion,
  PersonaTemplate,
  ProactiveResponse,
  TriggerCondition,
  TriggerInput,
  TriggerResult,
} from './types'
