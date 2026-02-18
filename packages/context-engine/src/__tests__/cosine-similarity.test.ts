import { describe, expect, it } from 'vitest'

import { cosineSimilarity } from '../consumption/smart-todo'

describe('cosineSimilarity', () => {
  it('returns 0 for empty arrays', () => {
    expect(cosineSimilarity([], [])).toBe(0)
  })

  it('returns 0 for mismatched array lengths', () => {
    expect(cosineSimilarity([1], [1, 2])).toBe(0)
  })

  it('returns 0 for zero vectors', () => {
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0)
  })

  it('returns 1.0 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1.0)
  })

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0)
  })

  it('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1.0)
  })

  it('returns correct similarity for known vectors', () => {
    // cos(45°) ≈ 0.707
    const result = cosineSimilarity([1, 0], [1, 1])
    expect(result).toBeCloseTo(Math.SQRT1_2, 5)
  })

  it('is scale-invariant', () => {
    const a = cosineSimilarity([1, 2, 3], [4, 5, 6])
    const b = cosineSimilarity([10, 20, 30], [40, 50, 60])
    expect(a).toBeCloseTo(b, 10)
  })

  it('returns 0 when one vector is zero', () => {
    expect(cosineSimilarity([1, 2, 3], [0, 0, 0])).toBe(0)
  })
})
