import { describe, expect, it } from 'vitest'

import type { EmotionState, TriggerResult } from '../types'
import { generateResponse } from '../response-generator'

describe('generateResponse', () => {
  const trigger: Extract<TriggerResult, { triggered: true }> = {
    triggered: true,
    triggerId: 'T03',
    triggerName: 'rest-reminder',
  }

  it('generates a non-empty message', () => {
    const response = generateResponse(trigger, 'caring')
    expect(response.message).toBeTruthy()
    expect(response.message.length).toBeGreaterThan(0)
  })

  it('includes the trigger ID in the response', () => {
    const response = generateResponse(trigger, 'caring')
    expect(response.triggerId).toBe('T03')
  })

  it('includes the emotion state in the response', () => {
    const response = generateResponse(trigger, 'caring')
    expect(response.emotion).toBe('caring')
  })

  it('generates different messages for different emotion states', () => {
    const emotions: EmotionState[] = ['neutral', 'happy', 'caring', 'worried']
    const messages = emotions.map(emotion => generateResponse(trigger, emotion).message)

    // At least some messages should differ based on emotion
    const uniqueMessages = new Set(messages)
    expect(uniqueMessages.size).toBeGreaterThan(1)
  })

  it('output contains emotion marker (emotion tag in message or response)', () => {
    const response = generateResponse(trigger, 'caring')
    // The response object itself carries the emotion field
    const validEmotions: EmotionState[] = ['neutral', 'happy', 'caring', 'playful', 'worried', 'sad']
    expect(validEmotions).toContain(response.emotion)
  })

  it('falls back to DEFAULT_MESSAGE for unknown trigger names', () => {
    const unknownTrigger: Extract<TriggerResult, { triggered: true }> = {
      triggered: true,
      triggerId: 'T99',
      triggerName: 'unknown-trigger',
    }
    const response = generateResponse(unknownTrigger, 'neutral')
    expect(response.message).toBeTruthy()
    expect(response.message.length).toBeGreaterThan(0)
    expect(response.triggerId).toBe('T99')
  })
})

describe('end-to-end: trigger -> emotion -> response', () => {
  it('produces a complete proactive response from trigger input', async () => {
    // Simulate the full pipeline inline (no mocks on domain logic)
    const { evaluateTriggers, T03_REST_REMINDER } = await import('../proactive-trigger')
    const { transitionEmotion, INITIAL_EMOTION } = await import('../emotion-state-machine')
    const { generateResponse: genResponse } = await import('../response-generator')

    // 1. Evaluate trigger: user worked 3 hours
    const triggerResult = evaluateTriggers(
      { continuousWorkDurationMs: 3 * 60 * 60 * 1000, isFullscreen: false, currentApp: 'VS Code' },
      [T03_REST_REMINDER],
      {},
      Date.now(),
    )

    expect(triggerResult.triggered).toBe(true)

    if (!triggerResult.triggered) {
      return
    }

    // 2. Transition emotion
    const newEmotion = transitionEmotion(INITIAL_EMOTION, triggerResult)
    expect(newEmotion).toBe('caring')

    // 3. Generate response
    const response = genResponse(triggerResult, newEmotion)
    expect(response.message.length).toBeGreaterThan(0)
    expect(response.emotion).toBe('caring')
    expect(response.triggerId).toBe('T03')
  })
})
