import sharp from 'sharp'

import { beforeAll, describe, expect, it } from 'vitest'

import { DeduplicationTracker } from '../capture/phash'

describe('deduplicationTracker', () => {
  describe('basic tracking', () => {
    it('starts with zero counts', () => {
      const tracker = new DeduplicationTracker()
      const stats = tracker.getStats()

      expect(stats.totalComparisons).toBe(0)
      expect(stats.duplicatesFound).toBe(0)
      expect(stats.uniqueFound).toBe(0)
      expect(stats.deduplicationRate).toBe(0)
    })

    it('tracks duplicate comparisons', () => {
      const tracker = new DeduplicationTracker()

      tracker.track(true) // duplicate
      tracker.track(true) // duplicate
      tracker.track(false) // unique

      const stats = tracker.getStats()
      expect(stats.totalComparisons).toBe(3)
      expect(stats.duplicatesFound).toBe(2)
      expect(stats.uniqueFound).toBe(1)
    })

    it('calculates dedup rate correctly', () => {
      const tracker = new DeduplicationTracker()

      tracker.track(true) // duplicate
      tracker.track(true) // duplicate
      tracker.track(true) // duplicate
      tracker.track(false) // unique

      const stats = tracker.getStats()
      expect(stats.deduplicationRate).toBeCloseTo(0.75, 2) // 3/4
    })

    it('handles zero comparisons gracefully', () => {
      const tracker = new DeduplicationTracker()
      const stats = tracker.getStats()

      expect(stats.deduplicationRate).toBe(0)
    })

    it('handles all duplicates', () => {
      const tracker = new DeduplicationTracker()

      tracker.track(true)
      tracker.track(true)
      tracker.track(true)

      const stats = tracker.getStats()
      expect(stats.deduplicationRate).toBeCloseTo(1.0, 2)
    })

    it('handles all unique', () => {
      const tracker = new DeduplicationTracker()

      tracker.track(false)
      tracker.track(false)
      tracker.track(false)

      const stats = tracker.getStats()
      expect(stats.deduplicationRate).toBe(0)
    })

    it('reset clears all counters', () => {
      const tracker = new DeduplicationTracker()

      tracker.track(true)
      tracker.track(false)
      tracker.track(true)

      tracker.reset()

      const stats = tracker.getStats()
      expect(stats.totalComparisons).toBe(0)
      expect(stats.duplicatesFound).toBe(0)
      expect(stats.uniqueFound).toBe(0)
      expect(stats.deduplicationRate).toBe(0)
    })
  })

  describe('simulated normal usage (pHash dedup rate >70%)', () => {
    /**
     * Simulates a realistic desktop usage scenario:
     * - User works in VS Code for extended periods (many similar screenshots)
     * - Occasional app switches (different screenshots)
     * - Pattern: 8-12 similar screenshots per session, then switch
     *
     * Expected dedup rate: >70% because most consecutive screenshots
     * look the same while the user works in the same app.
     */
    let similarImage1: Buffer
    let similarImage2: Buffer
    let differentImage: Buffer

    beforeAll(async () => {
      // Similar images: slight variation (gradient shift)
      const width = 64
      const height = 64

      // Image 1: dark gradient (simulating same VS Code window)
      const pixels1 = Buffer.alloc(width * height * 3)
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 3
          pixels1[i] = Math.floor((x / width) * 50) // Very dark
          pixels1[i + 1] = Math.floor((x / width) * 50)
          pixels1[i + 2] = Math.floor((x / width) * 80)
        }
      }
      similarImage1 = await sharp(pixels1, { raw: { width, height, channels: 3 } })
        .png()
        .toBuffer()

      // Image 2: very similar dark gradient (same app, cursor moved slightly)
      const pixels2 = Buffer.alloc(width * height * 3)
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 3
          pixels2[i] = Math.floor((x / width) * 52) // Slight difference
          pixels2[i + 1] = Math.floor((x / width) * 48)
          pixels2[i + 2] = Math.floor((x / width) * 82)
        }
      }
      similarImage2 = await sharp(pixels2, { raw: { width, height, channels: 3 } })
        .png()
        .toBuffer()

      // Different image: bright, completely different content (switching to browser)
      const pixels3 = Buffer.alloc(width * height * 3)
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 3
          pixels3[i] = 200 + Math.floor((y / height) * 55)
          pixels3[i + 1] = 220
          pixels3[i + 2] = 240
        }
      }
      differentImage = await sharp(pixels3, { raw: { width, height, channels: 3 } })
        .png()
        .toBuffer()
    })

    it('achieves >70% dedup rate in simulated normal desktop usage', async () => {
      const { computePHash, areSimilar } = await import('../capture/phash')

      const tracker = new DeduplicationTracker()

      // Simulate 60 minutes of screenshots at 60s intervals = 60 captures
      // Pattern: 10 similar (VS Code) → 2 different (switch to browser) → 10 similar → ...
      const captureSequence: Buffer[] = []

      // 3 sessions of focused work
      for (let session = 0; session < 3; session++) {
        // 10 similar screenshots (same app, slight variations)
        for (let i = 0; i < 10; i++) {
          captureSequence.push(i % 2 === 0 ? similarImage1 : similarImage2)
        }
        // 2 different screenshots (app switch)
        captureSequence.push(differentImage)
        captureSequence.push(similarImage1)
      }

      let lastHash: string | null = null
      for (const image of captureSequence) {
        const hash = await computePHash(image)

        if (lastHash !== null) {
          const isDuplicate = areSimilar(lastHash, hash, 5)
          tracker.track(isDuplicate)
        }

        lastHash = hash
      }

      const stats = tracker.getStats()

      // With 36 captures (3 sessions × 12), we expect:
      // - ~27 similar consecutive pairs (within each session of 10)
      // - ~8 different consecutive pairs (app switches + cross-session)
      // Dedup rate should be well above 70%
      expect(stats.deduplicationRate).toBeGreaterThan(0.7)
      expect(stats.totalComparisons).toBe(captureSequence.length - 1)
    })
  })
})
