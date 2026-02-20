import type { ContextSource } from '../processing/types'

import { describe, expect, it } from 'vitest'

import {
  computeImportance,
  deduplicateStrings,
  mergeKeywords,
  selectTopSources,
} from '../processing/context-merger'

describe('deduplicateStrings', () => {
  it('removes duplicates case-insensitively, preserving first occurrence casing', () => {
    expect(deduplicateStrings(['VS Code', 'vs code', 'TypeScript', 'typescript']))
      .toEqual(['VS Code', 'TypeScript'])
  })

  it('returns empty array for empty input', () => {
    expect(deduplicateStrings([])).toEqual([])
  })

  it('trims whitespace before comparison', () => {
    expect(deduplicateStrings([' React ', 'react', ' REACT']))
      .toEqual(['React'])
  })

  it('preserves order of first occurrences', () => {
    expect(deduplicateStrings(['c', 'b', 'a', 'C', 'B', 'A']))
      .toEqual(['c', 'b', 'a'])
  })

  it('handles single element', () => {
    expect(deduplicateStrings(['only'])).toEqual(['only'])
  })
})

describe('mergeKeywords', () => {
  function makeSource(keywords: string[]): ContextSource {
    return {
      source: 'activity',
      summary: '',
      entities: [],
      keywords,
      timestamp: Date.now(),
    }
  }

  it('merges keywords from multiple sources', () => {
    const sources = [
      makeSource(['TypeScript', 'coding']),
      makeSource(['development', 'coding']),
    ]
    const result = mergeKeywords(sources)
    expect(result).toContain('TypeScript')
    expect(result).toContain('coding')
    expect(result).toContain('development')
    expect(result).toHaveLength(3) // 'coding' deduplicated
  })

  it('deduplicates case-insensitively', () => {
    const sources = [
      makeSource(['React']),
      makeSource(['react', 'REACT']),
    ]
    expect(mergeKeywords(sources)).toEqual(['React'])
  })

  it('returns empty for no sources', () => {
    expect(mergeKeywords([])).toEqual([])
  })

  it('handles sources with empty keywords', () => {
    const sources = [
      makeSource([]),
      makeSource(['one']),
      makeSource([]),
    ]
    expect(mergeKeywords(sources)).toEqual(['one'])
  })
})

describe('computeImportance', () => {
  function makeSource(importance?: number): ContextSource {
    return {
      source: 'activity',
      summary: '',
      entities: [],
      keywords: [],
      timestamp: Date.now(),
      importance,
    }
  }

  it('returns average of source importances', () => {
    const sources = [makeSource(0.8), makeSource(0.4)]
    expect(computeImportance(sources)).toBeCloseTo(0.6, 5)
  })

  it('defaults to 0.5 for sources without importance', () => {
    const sources = [makeSource(undefined), makeSource(1.0)]
    // (0.5 + 1.0) / 2 = 0.75
    expect(computeImportance(sources)).toBeCloseTo(0.75, 5)
  })

  it('clamps result to [0, 1] for valid boundary values', () => {
    expect(computeImportance([makeSource(0)])).toBeCloseTo(0, 5)
    expect(computeImportance([makeSource(1)])).toBeCloseTo(1, 5)
  })

  it('clamps out-of-range importance values', () => {
    // importance: 1.5 should clamp to 1
    expect(computeImportance([makeSource(1.5)])).toBe(1)
    // importance: -0.5 should clamp to 0
    expect(computeImportance([makeSource(-0.5)])).toBe(0)
    // Average of 2.0 and 0.0 = 1.0 → clamped to 1
    expect(computeImportance([makeSource(2.0), makeSource(0)])).toBe(1)
  })

  it('returns 0.5 for empty sources', () => {
    expect(computeImportance([])).toBe(0.5)
  })

  it('handles all undefined importances', () => {
    const sources = [makeSource(undefined), makeSource(undefined)]
    expect(computeImportance(sources)).toBeCloseTo(0.5, 5)
  })
})

describe('selectTopSources', () => {
  function makeSource(timestamp: number, summary: string): ContextSource {
    return {
      source: 'activity',
      summary,
      entities: [],
      keywords: [],
      timestamp,
    }
  }

  it('returns all sources when under limit', () => {
    const sources = [makeSource(1000, 'a'), makeSource(2000, 'b')]
    expect(selectTopSources(sources, 5)).toHaveLength(2)
  })

  it('selects most recent sources when over limit', () => {
    const sources = [
      makeSource(3000, 'newest'),
      makeSource(1000, 'oldest'),
      makeSource(2000, 'middle'),
    ]
    const result = selectTopSources(sources, 2)
    expect(result).toHaveLength(2)
    const summaries = result.map(s => s.summary)
    expect(summaries).toContain('newest')
    expect(summaries).toContain('middle')
    expect(summaries).not.toContain('oldest')
  })

  it('returns empty for empty input', () => {
    expect(selectTopSources([], 10)).toEqual([])
  })

  it('handles limit of 1', () => {
    const sources = [
      makeSource(1000, 'old'),
      makeSource(3000, 'new'),
    ]
    const result = selectTopSources(sources, 1)
    expect(result).toHaveLength(1)
    expect(result[0].summary).toBe('new')
  })
})
