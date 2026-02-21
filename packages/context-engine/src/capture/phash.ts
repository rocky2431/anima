import sharp from 'sharp'

const HASH_SIZE = 8

/**
 * Compute a 64-bit average perceptual hash from an image buffer.
 *
 * Algorithm:
 * 1. Resize to 8x8 grayscale
 * 2. Compute the mean pixel value
 * 3. Each pixel above mean → '1', below → '0'
 *
 * Returns a 64-character binary string.
 */
export async function computePHash(imageBuffer: Buffer): Promise<string> {
  if (!imageBuffer || imageBuffer.length === 0) {
    throw new Error('computePHash: imageBuffer is empty or undefined')
  }

  const { data } = await sharp(imageBuffer)
    .resize(HASH_SIZE, HASH_SIZE, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const pixels = new Uint8Array(data)
  const totalPixels = HASH_SIZE * HASH_SIZE

  let sum = 0
  for (let i = 0; i < totalPixels; i++) {
    sum += pixels[i]
  }
  const mean = sum / totalPixels

  let hash = ''
  for (let i = 0; i < totalPixels; i++) {
    hash += pixels[i] >= mean ? '1' : '0'
  }

  return hash
}

/**
 * Compute the Hamming distance between two binary hash strings.
 * Throws if the strings have different lengths.
 */
export function hammingDistance(hash1: string, hash2: string): number {
  if (hash1.length !== hash2.length) {
    throw new Error(
      `Hash length mismatch: ${hash1.length} vs ${hash2.length}`,
    )
  }

  let distance = 0
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) {
      distance++
    }
  }

  return distance
}

/**
 * Check if two perceptual hashes are similar within a threshold.
 * Default threshold is 5 bits (out of 64).
 */
export function areSimilar(
  hash1: string,
  hash2: string,
  threshold = 5,
): boolean {
  return hammingDistance(hash1, hash2) <= threshold
}

// --- Deduplication Statistics ---

export interface DeduplicationStats {
  /** Total number of comparisons tracked */
  totalComparisons: number
  /** Number of comparisons that found duplicates */
  duplicatesFound: number
  /** Number of comparisons that found unique items */
  uniqueFound: number
  /** Deduplication rate (0-1): duplicatesFound / totalComparisons. 0 when no comparisons. */
  deduplicationRate: number
}

/**
 * Tracks deduplication statistics over time.
 * Intended to be paired with the ScreenshotPipeline to measure
 * how effectively pHash dedup reduces redundant VLM calls.
 */
export class DeduplicationTracker {
  private _duplicates = 0
  private _unique = 0

  /**
   * Record a comparison result.
   * @param isDuplicate true if the comparison found a duplicate, false if unique.
   */
  track(isDuplicate: boolean): void {
    if (isDuplicate) {
      this._duplicates++
    }
    else {
      this._unique++
    }
  }

  getStats(): DeduplicationStats {
    const total = this._duplicates + this._unique
    return {
      totalComparisons: total,
      duplicatesFound: this._duplicates,
      uniqueFound: this._unique,
      deduplicationRate: total > 0 ? this._duplicates / total : 0,
    }
  }

  reset(): void {
    this._duplicates = 0
    this._unique = 0
  }
}
