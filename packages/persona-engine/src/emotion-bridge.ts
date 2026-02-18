import type { AnimaEmotionPayload, PersonaEmotion } from './types'

/**
 * Mapping from PersonaEmotion to Anima Emotion (stage-ui Emotion enum values).
 *
 * Anima Emotion values: happy, sad, angry, think, surprised, awkward, question, curious, neutral
 * PersonaEmotion: idle, curious, caring, worried, sleepy, excited
 */
const EMOTION_MAP: Record<PersonaEmotion, AnimaEmotionPayload> = {
  idle: { name: 'neutral', intensity: 0.3 },
  curious: { name: 'curious', intensity: 0.7 },
  caring: { name: 'happy', intensity: 0.6 },
  worried: { name: 'sad', intensity: 0.5 },
  sleepy: { name: 'neutral', intensity: 0.2 },
  excited: { name: 'surprised', intensity: 0.8 },
}

/**
 * Map a PersonaEmotion state to the Anima Emotion system payload.
 * Pure function: given a persona emotion, returns the corresponding
 * Anima Emotion name and intensity.
 *
 * @param emotion - The current persona emotion state
 * @returns AnimaEmotionPayload with name (Emotion enum value) and intensity (0-1)
 */
export function mapToAnimaEmotion(emotion: PersonaEmotion): AnimaEmotionPayload {
  return EMOTION_MAP[emotion]
}
