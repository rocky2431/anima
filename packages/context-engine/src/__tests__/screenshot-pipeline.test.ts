import type { ProcessedScreenshotContext, ScreenshotProvider, VlmProvider, VlmResult } from '../types'

import sharp from 'sharp'

import { beforeAll, describe, expect, it } from 'vitest'

import { ScreenshotPipeline } from '../capture/screenshot-pipeline'

/**
 * Pre-generate PNG buffers for tests.
 * Real PNG images are required because the pipeline calls computePHash (sharp).
 *
 * Note: solid-color images all produce the same pHash (all pixels = mean → all '1').
 * We need images with different spatial patterns to get different hashes.
 */
let pngA: Buffer
let pngB: Buffer

beforeAll(async () => {
  // Image A: left half black, right half white (horizontal split)
  const widthA = 64
  const heightA = 64
  const pixelsA = Buffer.alloc(widthA * heightA * 3)
  for (let y = 0; y < heightA; y++) {
    for (let x = 0; x < widthA; x++) {
      const i = (y * widthA + x) * 3
      const val = x < widthA / 2 ? 0 : 255
      pixelsA[i] = val
      pixelsA[i + 1] = val
      pixelsA[i + 2] = val
    }
  }
  pngA = await sharp(pixelsA, { raw: { width: widthA, height: heightA, channels: 3 } })
    .png()
    .toBuffer()

  // Image B: top half black, bottom half white (vertical split)
  const widthB = 64
  const heightB = 64
  const pixelsB = Buffer.alloc(widthB * heightB * 3)
  for (let y = 0; y < heightB; y++) {
    for (let x = 0; x < widthB; x++) {
      const i = (y * widthB + x) * 3
      const val = y < heightB / 2 ? 0 : 255
      pixelsB[i] = val
      pixelsB[i + 1] = val
      pixelsB[i + 2] = val
    }
  }
  pngB = await sharp(pixelsB, { raw: { width: widthB, height: heightB, channels: 3 } })
    .png()
    .toBuffer()
})

// Test Double rationale: ScreenshotProvider wraps Electron desktopCapturer (platform API).
class SequentialScreenshotProvider implements ScreenshotProvider {
  captureCount = 0
  private buffers: Buffer[]

  constructor(buffers: Buffer[]) {
    this.buffers = buffers
  }

  async capture(): Promise<Buffer> {
    const idx = Math.min(this.captureCount, this.buffers.length - 1)
    this.captureCount++
    return this.buffers[idx]
  }
}

// Test Double rationale: VLM is an external API (LLM service).
class StubVlmProvider implements VlmProvider {
  callCount = 0

  async describeImage(_imageBuffer: Buffer): Promise<VlmResult> {
    this.callCount++
    return {
      description: 'User is browsing',
      entities: ['Chrome'],
      activity: 'browsing',
    }
  }
}

describe('screenshotPipeline', () => {
  // Test dedup and processing behavior via direct tick() calls (no timers needed)

  it('tick() captures and processes a screenshot', async () => {
    const screenshotProvider = new SequentialScreenshotProvider([pngA])
    const vlmProvider = new StubVlmProvider()
    const pipeline = new ScreenshotPipeline({
      screenshotProvider,
      vlmProvider,
    })

    const processed = await pipeline.tick()

    expect(processed).toBe(true)
    expect(screenshotProvider.captureCount).toBe(1)
    expect(vlmProvider.callCount).toBe(1)
  })

  it('skips VLM call when consecutive screenshots are similar (pHash dedup)', async () => {
    const screenshotProvider = new SequentialScreenshotProvider([pngA, pngA])
    const vlmProvider = new StubVlmProvider()
    const pipeline = new ScreenshotPipeline({
      screenshotProvider,
      vlmProvider,
    })

    // First tick: always processes (no previous hash)
    const first = await pipeline.tick()
    expect(first).toBe(true)
    expect(vlmProvider.callCount).toBe(1)

    // Second tick: same image → skip VLM
    const second = await pipeline.tick()
    expect(second).toBe(false) // Deduped
    expect(screenshotProvider.captureCount).toBe(2) // Captured but deduped
    expect(vlmProvider.callCount).toBe(1) // Still 1
  })

  it('calls VLM when screenshots differ', async () => {
    const screenshotProvider = new SequentialScreenshotProvider([pngA, pngB])
    const vlmProvider = new StubVlmProvider()
    const pipeline = new ScreenshotPipeline({
      screenshotProvider,
      vlmProvider,
    })

    const first = await pipeline.tick()
    expect(first).toBe(true)
    expect(vlmProvider.callCount).toBe(1)

    const second = await pipeline.tick()
    expect(second).toBe(true) // Different image → processed
    expect(vlmProvider.callCount).toBe(2)
  })

  it('emits processed context via onContext callback', async () => {
    const screenshotProvider = new SequentialScreenshotProvider([pngA])
    const vlmProvider = new StubVlmProvider()
    const contexts: ProcessedScreenshotContext[] = []

    const pipeline = new ScreenshotPipeline({
      screenshotProvider,
      vlmProvider,
      onContext: (ctx) => {
        contexts.push(ctx)
      },
    })

    await pipeline.tick()

    expect(contexts).toHaveLength(1)
    expect(contexts[0]).toMatchObject({
      description: 'User is browsing',
      entities: ['Chrome'],
      activity: 'browsing',
    })
    expect(contexts[0].hash).toHaveLength(64)
    expect(contexts[0].hash).toMatch(/^[01]+$/)
  })

  it('does not emit context when screenshot is deduped', async () => {
    const screenshotProvider = new SequentialScreenshotProvider([pngA, pngA])
    const vlmProvider = new StubVlmProvider()
    const contexts: ProcessedScreenshotContext[] = []

    const pipeline = new ScreenshotPipeline({
      screenshotProvider,
      vlmProvider,
      onContext: (ctx) => {
        contexts.push(ctx)
      },
    })

    await pipeline.tick()
    expect(contexts).toHaveLength(1)

    await pipeline.tick()
    expect(contexts).toHaveLength(1) // Deduped — no new context
  })

  it('resetDedup() clears dedup state', async () => {
    const screenshotProvider = new SequentialScreenshotProvider([pngA, pngA])
    const vlmProvider = new StubVlmProvider()
    const pipeline = new ScreenshotPipeline({
      screenshotProvider,
      vlmProvider,
    })

    await pipeline.tick()
    expect(vlmProvider.callCount).toBe(1)

    // Without reset: deduped
    const deduped = await pipeline.tick()
    expect(deduped).toBe(false)

    // After reset: processes again
    pipeline.resetDedup()
    const afterReset = await pipeline.tick()
    expect(afterReset).toBe(true)
    expect(vlmProvider.callCount).toBe(2)
  })

  it('start() creates timer and stop() clears it', () => {
    const screenshotProvider = new SequentialScreenshotProvider([pngA])
    const vlmProvider = new StubVlmProvider()
    const pipeline = new ScreenshotPipeline({
      screenshotProvider,
      vlmProvider,
    })

    expect(pipeline.isRunning).toBe(false)

    pipeline.start()
    expect(pipeline.isRunning).toBe(true)

    pipeline.stop()
    expect(pipeline.isRunning).toBe(false)
  })

  it('start() is idempotent', () => {
    const screenshotProvider = new SequentialScreenshotProvider([pngA])
    const vlmProvider = new StubVlmProvider()
    const pipeline = new ScreenshotPipeline({
      screenshotProvider,
      vlmProvider,
    })

    pipeline.start()
    pipeline.start() // Should not create duplicate timers
    expect(pipeline.isRunning).toBe(true)

    pipeline.stop()
    expect(pipeline.isRunning).toBe(false)
  })

  it('reports errors via onError when capture fails', async () => {
    const failingProvider: ScreenshotProvider = {
      async capture(): Promise<Buffer> {
        throw new Error('Permission denied')
      },
    }
    const vlmProvider = new StubVlmProvider()
    const errors: Error[] = []

    const pipeline = new ScreenshotPipeline({
      screenshotProvider: failingProvider,
      vlmProvider,
      onError: (err) => {
        errors.push(err)
      },
    })

    const result = await pipeline.tick()

    expect(result).toBe(false)
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBe('Screenshot pipeline tick failed')
    expect(errors[0].cause).toBeInstanceOf(Error)
    expect((errors[0].cause as Error).message).toBe('Screenshot capture failed')
  })

  it('reports errors via onError when VLM fails', async () => {
    const screenshotProvider = new SequentialScreenshotProvider([pngA])
    const failingVlm: VlmProvider = {
      async describeImage(): Promise<VlmResult> {
        throw new Error('Model overloaded')
      },
    }
    const errors: Error[] = []

    const pipeline = new ScreenshotPipeline({
      screenshotProvider,
      vlmProvider: failingVlm,
      onError: (err) => {
        errors.push(err)
      },
    })

    const result = await pipeline.tick()

    expect(result).toBe(false)
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBe('Screenshot pipeline tick failed')
  })

  it('tracks deduplication stats via getDeduplicationStats()', async () => {
    // Sequence: A, A, B → 1st unique (no previous), 2nd duplicate, 3rd unique (different)
    const screenshotProvider = new SequentialScreenshotProvider([pngA, pngA, pngB])
    const vlmProvider = new StubVlmProvider()
    const pipeline = new ScreenshotPipeline({
      screenshotProvider,
      vlmProvider,
    })

    await pipeline.tick() // pngA — first capture, no previous hash, isDuplicate=false
    await pipeline.tick() // pngA — same as previous, isDuplicate=true
    await pipeline.tick() // pngB — different, isDuplicate=false

    const stats = pipeline.getDeduplicationStats()
    expect(stats.totalComparisons).toBe(3)
    expect(stats.duplicatesFound).toBe(1)
    expect(stats.uniqueFound).toBe(2)
    expect(stats.deduplicationRate).toBeCloseTo(1 / 3)
  })

  it('accepts external DeduplicationTracker', async () => {
    const { DeduplicationTracker } = await import('../capture/phash')
    const tracker = new DeduplicationTracker()

    const screenshotProvider = new SequentialScreenshotProvider([pngA, pngA])
    const vlmProvider = new StubVlmProvider()
    const pipeline = new ScreenshotPipeline({
      screenshotProvider,
      vlmProvider,
      deduplicationTracker: tracker,
    })

    await pipeline.tick()
    await pipeline.tick()

    // External tracker sees the same data
    expect(tracker.getStats().totalComparisons).toBe(2)
    expect(pipeline.getDeduplicationStats()).toEqual(tracker.getStats())
  })
})
