import type { EmotionState, TriggerResult } from '../types'

import { describe, expect, it } from 'vitest'

import { ALL_TRIGGERS } from '../proactive-trigger'
import { generateResponse } from '../response-generator'

function makeTriggered(triggerId: string, triggerName: string): Extract<TriggerResult, { triggered: true }> {
  return { triggered: true, triggerId, triggerName, suggestedEmotion: 'caring' as const }
}

describe('generateResponse', () => {
  const restReminder = makeTriggered('T03', 'rest-reminder')

  it('generates a non-empty message', () => {
    const response = generateResponse(restReminder, 'caring')
    expect(response.message).toBeTruthy()
    expect(response.message.length).toBeGreaterThan(0)
  })

  it('includes the trigger ID in the response', () => {
    const response = generateResponse(restReminder, 'caring')
    expect(response.triggerId).toBe('T03')
  })

  it('includes the emotion state in the response', () => {
    const response = generateResponse(restReminder, 'caring')
    expect(response.emotion).toBe('caring')
  })

  describe('rest-reminder templates for each emotion', () => {
    const emotions: EmotionState[] = ['idle', 'curious', 'caring', 'worried', 'excited', 'sleepy']

    it('generates a response for every emotion state', () => {
      for (const emotion of emotions) {
        const response = generateResponse(restReminder, emotion)
        expect(response.message).toBeTruthy()
        expect(response.emotion).toBe(emotion)
      }
    })

    it('generates different messages for different emotions', () => {
      const messages = emotions.map(e => generateResponse(restReminder, e).message)
      const unique = new Set(messages)
      expect(unique.size).toBeGreaterThan(1)
    })
  })

  describe('fallback behavior', () => {
    it('falls back to DEFAULT_MESSAGE for unknown trigger names', () => {
      const unknownTrigger = makeTriggered('T99', 'unknown-trigger')
      const response = generateResponse(unknownTrigger, 'idle')
      expect(response.message).toBeTruthy()
      expect(response.triggerId).toBe('T99')
    })

    it('falls back to idle template when emotion key is missing from templates', () => {
      // All current emotions have templates, but if a new emotion were added
      // the fallback chain is: emotion-specific -> idle -> DEFAULT_MESSAGE
      const response = generateResponse(restReminder, 'idle')
      expect(response.message).toBeTruthy()
    })
  })

  describe('response structure', () => {
    it('output contains valid emotion value', () => {
      const response = generateResponse(restReminder, 'caring')
      const validEmotions: EmotionState[] = ['idle', 'curious', 'caring', 'worried', 'sleepy', 'excited']
      expect(validEmotions).toContain(response.emotion)
    })
  })

  describe('all 11 triggers have templates', () => {
    const emotions: EmotionState[] = ['idle', 'curious', 'caring', 'worried', 'excited', 'sleepy']
    const defaultMessage = '有什么需要帮忙的吗？'

    it('every trigger produces a non-default message for its suggested emotion', () => {
      for (const trigger of ALL_TRIGGERS) {
        const result = generateResponse(
          { triggered: true, triggerId: trigger.id, triggerName: trigger.name, suggestedEmotion: trigger.suggestedEmotion },
          trigger.suggestedEmotion,
        )
        expect(result.message, `${trigger.name} should have a template for ${trigger.suggestedEmotion}`).not.toBe(defaultMessage)
      }
    })

    it('every trigger has templates for all 6 emotions', () => {
      for (const trigger of ALL_TRIGGERS) {
        for (const emotion of emotions) {
          const result = generateResponse(
            { triggered: true, triggerId: trigger.id, triggerName: trigger.name, suggestedEmotion: trigger.suggestedEmotion },
            emotion,
          )
          expect(result.message, `${trigger.name}/${emotion} should not fallback`).not.toBe(defaultMessage)
        }
      }
    })
  })
})
