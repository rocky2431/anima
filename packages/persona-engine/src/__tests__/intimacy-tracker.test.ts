import { describe, expect, it } from 'vitest'

import {
  applyScoreChange,
  createIntimacyState,
  getStageForScore,
  INTIMACY_SCORE_CHANGES,
  INTIMACY_STAGES,
} from '../intimacy-tracker'

describe('intimacy tracker', () => {
  describe('createIntimacyState', () => {
    it('creates initial state with score 0 and stage stranger', () => {
      const state = createIntimacyState()
      expect(state.score).toBe(0)
      expect(state.stage).toBe('stranger')
    })

    it('creates state with custom initial score', () => {
      const state = createIntimacyState(50)
      expect(state.score).toBe(50)
      expect(state.stage).toBe('friend')
    })
  })

  describe('getStageForScore', () => {
    it('returns stranger for score 0-15', () => {
      expect(getStageForScore(0)).toBe('stranger')
      expect(getStageForScore(15)).toBe('stranger')
    })

    it('returns acquaintance for score 16-35', () => {
      expect(getStageForScore(16)).toBe('acquaintance')
      expect(getStageForScore(35)).toBe('acquaintance')
    })

    it('returns friend for score 36-60', () => {
      expect(getStageForScore(36)).toBe('friend')
      expect(getStageForScore(60)).toBe('friend')
    })

    it('returns closeFriend for score 61-85', () => {
      expect(getStageForScore(61)).toBe('closeFriend')
      expect(getStageForScore(85)).toBe('closeFriend')
    })

    it('returns soulmate for score 86-100', () => {
      expect(getStageForScore(86)).toBe('soulmate')
      expect(getStageForScore(100)).toBe('soulmate')
    })

    it('clamps negative scores to stranger', () => {
      expect(getStageForScore(-5)).toBe('stranger')
    })

    it('clamps scores above 100 to soulmate', () => {
      expect(getStageForScore(150)).toBe('soulmate')
    })
  })

  describe('applyScoreChange', () => {
    it('increments score by +1 for conversation', () => {
      const state = createIntimacyState(10)
      const next = applyScoreChange(state, 'conversation')
      expect(next.score).toBe(11)
    })

    it('increments score by +3 for deepConversation', () => {
      const state = createIntimacyState(10)
      const next = applyScoreChange(state, 'deepConversation')
      expect(next.score).toBe(13)
    })

    it('updates stage when crossing boundary', () => {
      const state = createIntimacyState(15)
      expect(state.stage).toBe('stranger')

      const next = applyScoreChange(state, 'conversation')
      expect(next.score).toBe(16)
      expect(next.stage).toBe('acquaintance')
    })

    it('clamps score at 100', () => {
      const state = createIntimacyState(99)
      const next = applyScoreChange(state, 'deepConversation')
      expect(next.score).toBe(100)
      expect(next.stage).toBe('soulmate')
    })

    it('returns a new state object (immutable)', () => {
      const state = createIntimacyState(10)
      const next = applyScoreChange(state, 'conversation')
      expect(next).not.toBe(state)
      expect(state.score).toBe(10) // original unchanged
    })
  })

  describe('stage boundaries definition', () => {
    it('defines 5 stages', () => {
      expect(INTIMACY_STAGES).toHaveLength(5)
    })

    it('covers the full 0-100 range without gaps', () => {
      for (let score = 0; score <= 100; score++) {
        const stage = getStageForScore(score)
        expect(stage).toBeTruthy()
      }
    })
  })

  describe('score change constants', () => {
    it('conversation gives +1', () => {
      expect(INTIMACY_SCORE_CHANGES.conversation).toBe(1)
    })

    it('deepConversation gives +3', () => {
      expect(INTIMACY_SCORE_CHANGES.deepConversation).toBe(3)
    })
  })
})
