import type { ProcessedScreenshotContext, ScreenshotProvider, VlmProvider } from '../types'
import type { DeduplicationStats } from './phash'

import { ScreenshotProcessor } from '../processing/screenshot-processor'
import { areSimilar, computePHash, DeduplicationTracker } from './phash'
import { ScreenshotCapture } from './screenshot'

export interface ScreenshotPipelineOptions {
  screenshotProvider: ScreenshotProvider
  vlmProvider: VlmProvider
  /** Capture interval in milliseconds. Default: 60000 (60s) */
  intervalMs?: number
  /** pHash similarity threshold (bits). Default: 5 */
  similarityThreshold?: number
  /** Callback invoked with each new (non-deduped) processed context */
  onContext?: (context: ProcessedScreenshotContext) => void
  /** Callback invoked when a tick fails. Receives the error with context. */
  onError?: (error: Error) => void
  /** Optional external DeduplicationTracker. If omitted, an internal one is created. */
  deduplicationTracker?: DeduplicationTracker
}

/**
 * Orchestrates the full screenshot pipeline:
 * periodic capture → pHash dedup → VLM understanding → callback.
 *
 * Imperative Shell that ties together ScreenshotCapture, pHash, and ScreenshotProcessor.
 */
export class ScreenshotPipeline {
  private capture: ScreenshotCapture
  private processor: ScreenshotProcessor
  private intervalMs: number
  private similarityThreshold: number
  private onContext?: (context: ProcessedScreenshotContext) => void
  private onError?: (error: Error) => void
  private timer: ReturnType<typeof setInterval> | null = null
  private lastHash: string | null = null
  private ticking = false
  private dedupTracker: DeduplicationTracker

  constructor(options: ScreenshotPipelineOptions) {
    this.capture = new ScreenshotCapture(options.screenshotProvider)
    this.processor = new ScreenshotProcessor(options.vlmProvider)
    this.intervalMs = options.intervalMs ?? 60_000
    this.similarityThreshold = options.similarityThreshold ?? 5
    this.onContext = options.onContext
    this.onError = options.onError
    this.dedupTracker = options.deduplicationTracker ?? new DeduplicationTracker()
  }

  /**
   * Start periodic screenshot capture.
   * First capture happens immediately, then repeats at intervalMs.
   */
  start(): void {
    if (this.timer !== null) {
      return
    }

    this.lastHash = null
    void this.tick()

    this.timer = setInterval(() => {
      void this.tick()
    }, this.intervalMs)
  }

  /**
   * Stop periodic screenshot capture.
   */
  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /**
   * Execute one capture cycle: screenshot → pHash dedup → VLM → emit.
   * Returns true if the screenshot was processed (not deduped), false if skipped.
   * Can be called directly for manual triggering without start()/stop().
   */
  async tick(): Promise<boolean> {
    if (this.ticking) {
      return false
    }

    this.ticking = true
    let context: ProcessedScreenshotContext | null = null

    try {
      const screenshot = await this.capture.capture()
      const hash = await computePHash(screenshot.buffer)

      const isDuplicate = this.lastHash !== null && areSimilar(this.lastHash, hash, this.similarityThreshold)
      this.dedupTracker.track(isDuplicate)

      if (isDuplicate) {
        return false
      }

      this.lastHash = hash

      const understanding = await this.processor.process(screenshot)
      context = { ...understanding, hash }
      return true
    }
    catch (error) {
      const wrappedError = error instanceof Error
        ? new Error('Screenshot pipeline tick failed', { cause: error })
        : new Error(`Screenshot pipeline tick failed: ${String(error)}`)
      this.onError?.(wrappedError)
      return false
    }
    finally {
      this.ticking = false
      if (context !== null) {
        this.onContext?.(context)
      }
    }
  }

  /**
   * Reset dedup state (clears the last known hash).
   */
  resetDedup(): void {
    this.lastHash = null
  }

  get isRunning(): boolean {
    return this.timer !== null
  }

  /** Returns deduplication statistics for this pipeline's lifetime. */
  getDeduplicationStats(): DeduplicationStats {
    return this.dedupTracker.getStats()
  }
}
