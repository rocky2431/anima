import sharp from 'sharp'

import { describe, expect, it } from 'vitest'

import { areSimilar, computePHash, hammingDistance } from '../capture/phash'

/**
 * Create a solid-color PNG buffer for testing.
 * Note: all solid-color images produce the same pHash (all pixels equal
 * mean → all bits '1'). Use images with spatial patterns for distinct hashes.
 */
async function createSolidPng(
  r: number,
  g: number,
  b: number,
  width = 64,
  height = 64,
): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r, g, b },
    },
  })
    .png()
    .toBuffer()
}

describe('pHash', () => {
  describe('computePHash', () => {
    it('returns a 64-character binary string', async () => {
      const image = await createSolidPng(128, 128, 128)
      const hash = await computePHash(image)

      expect(hash).toHaveLength(64)
      expect(hash).toMatch(/^[01]+$/)
    })

    it('returns the same hash for identical images', async () => {
      const image = await createSolidPng(200, 100, 50)
      const hash1 = await computePHash(image)
      const hash2 = await computePHash(image)

      expect(hash1).toBe(hash2)
    })

    it('returns similar hash for slightly different images', async () => {
      const image1 = await createSolidPng(200, 100, 50)
      const image2 = await createSolidPng(202, 101, 51)
      const hash1 = await computePHash(image1)
      const hash2 = await computePHash(image2)

      const distance = hammingDistance(hash1, hash2)
      // Very similar images should have small hamming distance (< 10 of 64 bits)
      expect(distance).toBeLessThan(10)
    })

    it('returns different hash for visually different images', async () => {
      // Solid-color images all produce the same pHash (all pixels = mean → all '1').
      // Use images with different spatial patterns to get genuinely different hashes.
      const width = 64
      const height = 64

      // Image 1: left half black, right half white
      const pixelsH = Buffer.alloc(width * height * 3)
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 3
          const val = x < width / 2 ? 0 : 255
          pixelsH[i] = pixelsH[i + 1] = pixelsH[i + 2] = val
        }
      }
      const horizontalSplit = await sharp(pixelsH, {
        raw: { width, height, channels: 3 },
      }).png().toBuffer()

      // Image 2: top half black, bottom half white
      const pixelsV = Buffer.alloc(width * height * 3)
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 3
          const val = y < height / 2 ? 0 : 255
          pixelsV[i] = pixelsV[i + 1] = pixelsV[i + 2] = val
        }
      }
      const verticalSplit = await sharp(pixelsV, {
        raw: { width, height, channels: 3 },
      }).png().toBuffer()

      const hash1 = await computePHash(horizontalSplit)
      const hash2 = await computePHash(verticalSplit)

      expect(hash1).not.toBe(hash2)
    })

    it('handles images of different sizes', async () => {
      const small = await createSolidPng(128, 64, 32, 32, 32)
      const large = await createSolidPng(128, 64, 32, 1920, 1080)
      const hash1 = await computePHash(small)
      const hash2 = await computePHash(large)

      // Same color, different sizes → should produce similar hashes
      const distance = hammingDistance(hash1, hash2)
      expect(distance).toBeLessThan(10)
    })

    it('throws on empty buffer', async () => {
      await expect(computePHash(Buffer.alloc(0))).rejects.toThrow(
        'computePHash: imageBuffer is empty or undefined',
      )
    })

    it('throws on non-image buffer', async () => {
      await expect(computePHash(Buffer.from('not-an-image'))).rejects.toThrow()
    })
  })

  describe('hammingDistance', () => {
    it('returns 0 for identical hashes', () => {
      const hash = '0'.repeat(64)
      expect(hammingDistance(hash, hash)).toBe(0)
    })

    it('counts the number of differing bits', () => {
      const hash1 = `1${'0'.repeat(63)}`
      const hash2 = '0'.repeat(64)
      expect(hammingDistance(hash1, hash2)).toBe(1)
    })

    it('returns 64 for completely opposite hashes', () => {
      const hash1 = '0'.repeat(64)
      const hash2 = '1'.repeat(64)
      expect(hammingDistance(hash1, hash2)).toBe(64)
    })

    it('throws on mismatched lengths', () => {
      expect(() => hammingDistance('01', '011')).toThrow()
    })
  })

  describe('areSimilar', () => {
    it('returns true for identical hashes', () => {
      const hash = '0'.repeat(64)
      expect(areSimilar(hash, hash)).toBe(true)
    })

    it('returns true when distance is within threshold', () => {
      // threshold=10 means up to 10 bits can differ → similar
      const hash1 = '1'.repeat(5) + '0'.repeat(59)
      const hash2 = '0'.repeat(64)
      expect(areSimilar(hash1, hash2, 10)).toBe(true)
    })

    it('returns false when distance exceeds threshold', () => {
      const hash1 = '1'.repeat(15) + '0'.repeat(49)
      const hash2 = '0'.repeat(64)
      expect(areSimilar(hash1, hash2, 10)).toBe(false)
    })

    it('uses default threshold of 5', () => {
      // 3 bits different → within default threshold
      const hash1 = '1'.repeat(3) + '0'.repeat(61)
      const hash2 = '0'.repeat(64)
      expect(areSimilar(hash1, hash2)).toBe(true)

      // 8 bits different → exceeds default threshold
      const hash3 = '1'.repeat(8) + '0'.repeat(56)
      expect(areSimilar(hash3, hash2)).toBe(false)
    })
  })
})
