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
