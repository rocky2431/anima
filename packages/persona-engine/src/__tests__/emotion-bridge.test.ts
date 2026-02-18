import type { PersonaEmotion } from '../types'

import { describe, expect, it } from 'vitest'

import { mapToAnimaEmotion } from '../emotion-bridge'

describe('emotion bridge: PersonaEmotion → Anima Emotion', () => {
  it('maps idle to neutral with low intensity', () => {
    const result = mapToAnimaEmotion('idle')
    expect(result.name).toBe('neutral')
    expect(result.intensity).toBeLessThan(0.5)
  })

  it('maps curious to curious', () => {
    const result = mapToAnimaEmotion('curious')
    expect(result.name).toBe('curious')
    expect(result.intensity).toBeGreaterThan(0.5)
  })

  it('maps caring to happy', () => {
    const result = mapToAnimaEmotion('caring')
    expect(result.name).toBe('happy')
    expect(result.intensity).toBeGreaterThan(0.5)
  })

  it('maps worried to sad', () => {
    const result = mapToAnimaEmotion('worried')
    expect(result.name).toBe('sad')
    expect(result.intensity).toBeGreaterThan(0.3)
  })

  it('maps sleepy to neutral with very low intensity', () => {
    const result = mapToAnimaEmotion('sleepy')
    expect(result.name).toBe('neutral')
    expect(result.intensity).toBeLessThan(0.3)
  })

  it('maps excited to surprised with high intensity', () => {
    const result = mapToAnimaEmotion('excited')
    expect(result.name).toBe('surprised')
    expect(result.intensity).toBeGreaterThan(0.7)
  })

  it('all 6 persona emotions produce valid Anima Emotion mappings', () => {
    const validAnimaEmotions = ['happy', 'sad', 'angry', 'think', 'surprised', 'awkward', 'question', 'curious', 'neutral']
    const personaEmotions: PersonaEmotion[] = ['idle', 'curious', 'caring', 'worried', 'sleepy', 'excited']

    for (const emotion of personaEmotions) {
      const result = mapToAnimaEmotion(emotion)
      expect(validAnimaEmotions).toContain(result.name)
      expect(result.intensity).toBeGreaterThanOrEqual(0)
      expect(result.intensity).toBeLessThanOrEqual(1)
    }
  })
})
