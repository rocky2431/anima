export {
  canTrigger,
  createDefaultConfig,
  createDoNotDisturbState,
  isFrequencyExceeded,
  isInQuietHours,
  recordIgnore,
  recordTrigger,
  recordUserInteraction,
} from './do-not-disturb'

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

export {
  ALL_TRIGGERS,
  evaluateTriggers,
  INTIMACY_ORDER,
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
} from './proactive-trigger'

export { generateResponse } from './response-generator'
export type {
  AnimaEmotionName,
  AnimaEmotionPayload,
  AppCategory,
  DoNotDisturbConfig,
  DoNotDisturbState,
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
  TriggerPriority,
  TriggerResult,
} from './types'
