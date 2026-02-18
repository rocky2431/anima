import { describe, expect, it } from 'vitest'

import { createEmotionActor } from '../emotion-state-machine'

describe('emotion state machine (xstate v5)', () => {
  it('starts in idle state', () => {
    const actor = createEmotionActor()
    expect(actor.getSnapshot().value).toBe('idle')
    actor.stop()
  })

  describe('idle state transitions', () => {
    it('transitions idle → curious on USER_ACTIVE', () => {
      const actor = createEmotionActor()
      actor.send({ type: 'USER_ACTIVE' })
      expect(actor.getSnapshot().value).toBe('curious')
      actor.stop()
    })

    it('transitions idle → worried on TRIGGER_CONCERN', () => {
      const actor = createEmotionActor()
      actor.send({ type: 'TRIGGER_CONCERN' })
      expect(actor.getSnapshot().value).toBe('worried')
      actor.stop()
    })

    it('transitions idle → sleepy on LATE_NIGHT', () => {
      const actor = createEmotionActor()
      actor.send({ type: 'LATE_NIGHT' })
      expect(actor.getSnapshot().value).toBe('sleepy')
      actor.stop()
    })

    it('transitions idle → excited on GOOD_NEWS', () => {
      const actor = createEmotionActor()
      actor.send({ type: 'GOOD_NEWS' })
      expect(actor.getSnapshot().value).toBe('excited')
      actor.stop()
    })
  })

  describe('curious state transitions', () => {
    it('transitions curious → caring on USER_SHARES_PERSONAL', () => {
      const actor = createEmotionActor()
      actor.send({ type: 'USER_ACTIVE' }) // idle → curious
      actor.send({ type: 'USER_SHARES_PERSONAL' })
      expect(actor.getSnapshot().value).toBe('caring')
      actor.stop()
    })

    it('transitions curious → worried on TRIGGER_CONCERN', () => {
      const actor = createEmotionActor()
      actor.send({ type: 'USER_ACTIVE' })
      actor.send({ type: 'TRIGGER_CONCERN' })
      expect(actor.getSnapshot().value).toBe('worried')
      actor.stop()
    })

    it('transitions curious → idle on CONVERSATION_END', () => {
      const actor = createEmotionActor()
      actor.send({ type: 'USER_ACTIVE' })
      actor.send({ type: 'CONVERSATION_END' })
      expect(actor.getSnapshot().value).toBe('idle')
      actor.stop()
    })

    it('transitions curious → excited on GOOD_NEWS', () => {
      const actor = createEmotionActor()
      actor.send({ type: 'USER_ACTIVE' })
      actor.send({ type: 'GOOD_NEWS' })
      expect(actor.getSnapshot().value).toBe('excited')
      actor.stop()
    })
  })

  describe('caring state transitions', () => {
    it('transitions caring → idle on CONVERSATION_END', () => {
      const actor = createEmotionActor()
      actor.send({ type: 'USER_ACTIVE' })
      actor.send({ type: 'USER_SHARES_PERSONAL' })
      actor.send({ type: 'CONVERSATION_END' })
      expect(actor.getSnapshot().value).toBe('idle')
      actor.stop()
    })

    it('transitions caring → worried on TRIGGER_CONCERN', () => {
      const actor = createEmotionActor()
      actor.send({ type: 'USER_ACTIVE' })
      actor.send({ type: 'USER_SHARES_PERSONAL' })
      actor.send({ type: 'TRIGGER_CONCERN' })
      expect(actor.getSnapshot().value).toBe('worried')
      actor.stop()
    })
  })

  describe('worried state transitions', () => {
    it('transitions worried → caring on USER_REASSURED', () => {
      const actor = createEmotionActor()
      actor.send({ type: 'TRIGGER_CONCERN' })
      actor.send({ type: 'USER_REASSURED' })
      expect(actor.getSnapshot().value).toBe('caring')
      actor.stop()
    })

    it('transitions worried → idle on CONVERSATION_END', () => {
      const actor = createEmotionActor()
      actor.send({ type: 'TRIGGER_CONCERN' })
      actor.send({ type: 'CONVERSATION_END' })
      expect(actor.getSnapshot().value).toBe('idle')
      actor.stop()
    })
  })

  describe('sleepy state transitions', () => {
    it('transitions sleepy → curious on USER_ACTIVE', () => {
      const actor = createEmotionActor()
      actor.send({ type: 'LATE_NIGHT' })
      actor.send({ type: 'USER_ACTIVE' })
      expect(actor.getSnapshot().value).toBe('curious')
      actor.stop()
    })

    it('transitions sleepy → idle on CONVERSATION_END', () => {
      const actor = createEmotionActor()
      actor.send({ type: 'LATE_NIGHT' })
      actor.send({ type: 'CONVERSATION_END' })
      expect(actor.getSnapshot().value).toBe('idle')
      actor.stop()
    })
  })

  describe('excited state transitions', () => {
    it('transitions excited → curious on CALM_DOWN', () => {
      const actor = createEmotionActor()
      actor.send({ type: 'GOOD_NEWS' })
      actor.send({ type: 'CALM_DOWN' })
      expect(actor.getSnapshot().value).toBe('curious')
      actor.stop()
    })

    it('transitions excited → idle on CONVERSATION_END', () => {
      const actor = createEmotionActor()
      actor.send({ type: 'GOOD_NEWS' })
      actor.send({ type: 'CONVERSATION_END' })
      expect(actor.getSnapshot().value).toBe('idle')
      actor.stop()
    })

    it('transitions excited → worried on TRIGGER_CONCERN', () => {
      const actor = createEmotionActor()
      actor.send({ type: 'GOOD_NEWS' })
      actor.send({ type: 'TRIGGER_CONCERN' })
      expect(actor.getSnapshot().value).toBe('worried')
      actor.stop()
    })
  })

  describe('multi-step transition chain: idle → curious → caring', () => {
    it('follows the natural conversation progression', () => {
      const actor = createEmotionActor()

      expect(actor.getSnapshot().value).toBe('idle')

      actor.send({ type: 'USER_ACTIVE' })
      expect(actor.getSnapshot().value).toBe('curious')

      actor.send({ type: 'USER_SHARES_PERSONAL' })
      expect(actor.getSnapshot().value).toBe('caring')

      actor.stop()
    })
  })

  describe('snapshot.can() for valid transitions', () => {
    it('reports valid transitions from idle', () => {
      const actor = createEmotionActor()
      expect(actor.getSnapshot().can({ type: 'USER_ACTIVE' })).toBe(true)
      expect(actor.getSnapshot().can({ type: 'USER_SHARES_PERSONAL' })).toBe(false)
      actor.stop()
    })
  })
})
