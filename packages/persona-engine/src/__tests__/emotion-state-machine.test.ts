import { describe, expect, it } from 'vitest'

import type { TriggerResult } from '../types'
import { INITIAL_EMOTION, transitionEmotion } from '../emotion-state-machine'

function makeTriggered(triggerId: string, triggerName: string): TriggerResult {
  return { triggered: true, triggerId, triggerName }
}

function makeNotTriggered(): TriggerResult {
  return { triggered: false }
}

describe('emotion state machine', () => {
  it('has neutral as the initial emotion state', () => {
    expect(INITIAL_EMOTION).toBe('neutral')
  })

  it('transitions to caring on rest-reminder trigger', () => {
    const trigger = makeTriggered('T03', 'rest-reminder')
    const newState = transitionEmotion('neutral', trigger)
    expect(newState).toBe('caring')
  })

  it('stays in current state when no trigger fires', () => {
    const trigger = makeNotTriggered()
    const newState = transitionEmotion('happy', trigger)
    expect(newState).toBe('happy')
  })

  it('transitions from any state to caring on rest-reminder', () => {
    const trigger = makeTriggered('T03', 'rest-reminder')

    expect(transitionEmotion('happy', trigger)).toBe('caring')
    expect(transitionEmotion('playful', trigger)).toBe('caring')
    expect(transitionEmotion('sad', trigger)).toBe('caring')
    expect(transitionEmotion('worried', trigger)).toBe('caring')
  })

  it('preserves current state for unknown trigger name', () => {
    const trigger = makeTriggered('T99', 'unknown-trigger')
    expect(transitionEmotion('happy', trigger)).toBe('happy')
    expect(transitionEmotion('caring', trigger)).toBe('caring')
  })
})
