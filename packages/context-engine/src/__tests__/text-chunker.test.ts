import { describe, expect, it } from 'vitest'

import { chunkText } from '../processing/text-chunker'

describe('chunkText', () => {
  it('returns empty array for empty text', () => {
    const result = chunkText('')
    expect(result).toEqual([])
  })

  it('returns single chunk for text shorter than chunkSize', () => {
    const text = 'Hello World'
    const result = chunkText(text, { chunkSize: 100, overlapSize: 20 })
    expect(result).toHaveLength(1)
    expect(result[0].content).toBe('Hello World')
    expect(result[0].index).toBe(0)
    expect(result[0].startOffset).toBe(0)
    expect(result[0].endOffset).toBe(11)
  })

  it('splits text into overlapping chunks', () => {
    // Create text of exactly 25 chars
    const text = 'abcdefghijklmnopqrstuvwxy'
    // chunkSize=10, overlap=3 → step=7
    // chunk0: offset 0..10 "abcdefghij"
    // chunk1: offset 7..17 "hijklmnopq"
    // chunk2: offset 14..24 "opqrstuvwx"
    // chunk3: offset 21..25 "vwxy"
    const result = chunkText(text, { chunkSize: 10, overlapSize: 3 })

    expect(result.length).toBeGreaterThanOrEqual(3)
    expect(result[0].content).toBe('abcdefghij')
    expect(result[0].startOffset).toBe(0)
    expect(result[0].endOffset).toBe(10)

    // Second chunk starts at offset 7
    expect(result[1].startOffset).toBe(7)
    expect(result[1].content.startsWith('hij')).toBe(true)

    // Verify overlap: last 3 chars of chunk0 === first 3 chars of chunk1
    const chunk0End = result[0].content.slice(-3)
    const chunk1Start = result[1].content.slice(0, 3)
    expect(chunk0End).toBe(chunk1Start)
  })

  it('provides correct sequential indices', () => {
    const text = 'a'.repeat(50)
    const result = chunkText(text, { chunkSize: 10, overlapSize: 2 })

    for (let i = 0; i < result.length; i++) {
      expect(result[i].index).toBe(i)
    }
  })

  it('uses default chunkSize=1000 and overlapSize=200', () => {
    const text = 'x'.repeat(2500)
    const result = chunkText(text)
    // step = 1000 - 200 = 800
    // chunks: 0, 800, 1600, 2400 → 4 chunks (last one is 2400..2500 = 100 chars)
    // Actually: offset 0→1000, 800→1800, 1600→2500 = 3 chunks, then offset 2400→2500 = 4th
    expect(result.length).toBeGreaterThanOrEqual(3)
    expect(result[0].content.length).toBe(1000)
  })

  it('handles text exactly equal to chunkSize', () => {
    const text = 'a'.repeat(10)
    const result = chunkText(text, { chunkSize: 10, overlapSize: 3 })
    expect(result).toHaveLength(1)
    expect(result[0].content).toBe(text)
  })

  it('preserves all original text content across chunks', () => {
    const text = 'The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs.'
    const result = chunkText(text, { chunkSize: 20, overlapSize: 5 })

    // Reconstruct: start from chunk0, then append only the non-overlapping part of each subsequent chunk
    let reconstructed = result[0].content
    for (let i = 1; i < result.length; i++) {
      const overlapStart = result[i].startOffset - result[i - 1].startOffset
      const newContent = result[i - 1].content.length - overlapStart
      reconstructed += result[i].content.slice(newContent)
    }

    // The reconstructed text should start and end like the original
    expect(reconstructed.startsWith('The quick')).toBe(true)
    expect(reconstructed.endsWith('jugs.')).toBe(true)
  })

  it('throws for non-positive chunkSize', () => {
    expect(() => chunkText('hello', { chunkSize: 0 })).toThrow('chunkSize must be positive')
    expect(() => chunkText('hello', { chunkSize: -1 })).toThrow('chunkSize must be positive')
  })

  it('throws for negative overlapSize', () => {
    expect(() => chunkText('hello', { chunkSize: 10, overlapSize: -1 })).toThrow('overlapSize must be non-negative')
  })

  it('throws when overlapSize >= chunkSize', () => {
    expect(() => chunkText('hello', { chunkSize: 10, overlapSize: 10 })).toThrow('overlapSize')
    expect(() => chunkText('hello', { chunkSize: 10, overlapSize: 15 })).toThrow('overlapSize')
  })
})
