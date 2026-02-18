import { describe, expect, it } from 'vitest'

import { mapToAnimaEmotion } from '../emotion-bridge'
import { createEmotionActor } from '../emotion-state-machine'
import { applyScoreChange, createIntimacyState } from '../intimacy-tracker'
import { getPersonaTemplate } from '../persona-template'
import { evaluateTriggers, T03_REST_REMINDER } from '../proactive-trigger'
import { generateResponse } from '../response-generator'

describe('end-to-end: full persona engine integration', () => {
  it('trigger -> emotion machine -> anima emotion bridge', () => {
    // 1. Evaluate trigger: user worked 3 hours
    const triggerResult = evaluateTriggers(
      { continuousWorkDurationMs: 3 * 60 * 60 * 1000, isFullscreen: false, currentApp: 'VS Code' },
      [T03_REST_REMINDER],
      {},
      Date.now(),
    )
    expect(triggerResult.triggered).toBe(true)

    // 2. Trigger fires -> send TRIGGER_CONCERN to emotion machine
    const actor = createEmotionActor()
    actor.send({ type: 'TRIGGER_CONCERN' })
    const emotionState = actor.getSnapshot().value as string
    expect(emotionState).toBe('worried')

    // 3. Map persona emotion to Anima Emotion
    const animaEmotion = mapToAnimaEmotion('worried')
    expect(animaEmotion.name).toBe('sad')
    expect(animaEmotion.intensity).toBeGreaterThan(0)

    actor.stop()
  })

  it('conversation progression: idle -> curious -> caring + intimacy growth', () => {
    const actor = createEmotionActor()

    // Start with idle
    expect(actor.getSnapshot().value).toBe('idle')

    // User becomes active -> curious
    actor.send({ type: 'USER_ACTIVE' })
    expect(actor.getSnapshot().value).toBe('curious')

    // User shares personal info -> caring
    actor.send({ type: 'USER_SHARES_PERSONAL' })
    expect(actor.getSnapshot().value).toBe('caring')

    // Track intimacy: 3 normal conversations + 1 deep
    let intimacy = createIntimacyState()
    intimacy = applyScoreChange(intimacy, 'conversation')
    intimacy = applyScoreChange(intimacy, 'conversation')
    intimacy = applyScoreChange(intimacy, 'conversation')
    intimacy = applyScoreChange(intimacy, 'deepConversation')
    expect(intimacy.score).toBe(6)
    expect(intimacy.stage).toBe('stranger')

    actor.stop()
  })

  it('persona template loads correctly and integrates with emotion', () => {
    const template = getPersonaTemplate('xiaorou')
    expect(template).toBeDefined()
    expect(template!.name).toBe('小柔')

    // Template default emotion should be mappable
    const animaEmotion = mapToAnimaEmotion(template!.defaultEmotion)
    expect(animaEmotion.name).toBeTruthy()
    expect(animaEmotion.intensity).toBeGreaterThanOrEqual(0)
  })

  it('response generator works with new emotion states', () => {
    const trigger = { triggered: true as const, triggerId: 'T03', triggerName: 'rest-reminder' }
    const response = generateResponse(trigger, 'caring')
    expect(response.message).toBeTruthy()
    expect(response.emotion).toBe('caring')
    expect(response.triggerId).toBe('T03')
  })
})
