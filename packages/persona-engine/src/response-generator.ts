import type { EmotionState, ProactiveResponse, TriggerResult } from './types'

/**
 * Template-based response messages keyed by trigger name and emotion state.
 */
const RESPONSE_TEMPLATES: Record<string, Partial<Record<EmotionState, string>>> = {
  'rest-reminder': {
    caring: '工作了好久了，休息一下吧～ 站起来活动活动身体？',
    idle: '已经连续工作超过两小时了，建议休息一下。',
    curious: '哇，你好专注！不过也该休息一下啦，去喝杯水吧～',
    worried: '你已经连续工作很久了呢...要不要先休息一会儿？我有点担心你。',
    excited: '嘿嘿，工作狂！是时候给自己放个小假啦～',
    sleepy: '工作辛苦了...休息一下好吗？',
  },
}

const DEFAULT_MESSAGE = '休息一下吧。'

/**
 * Generate a proactive persona response based on trigger and emotion.
 * Uses template-based generation. No LLM dependency required.
 *
 * @param trigger - The trigger result that caused this response (must be triggered)
 * @param emotion - Current emotion state
 * @returns A persona-driven proactive response
 */
export function generateResponse(
  trigger: Extract<TriggerResult, { triggered: true }>,
  emotion: EmotionState,
): ProactiveResponse {
  const templates = RESPONSE_TEMPLATES[trigger.triggerName]
  const message = templates?.[emotion] ?? templates?.idle ?? DEFAULT_MESSAGE

  return {
    message,
    emotion,
    triggerId: trigger.triggerId,
  }
}
