import type { ScreenshotResult, VlmProvider, VlmResult } from '../types'

/**
 * Result of VLM understanding without pHash (hash is added by the pipeline).
 */
export interface ScreenshotUnderstanding {
  description: string
  entities: string[]
  activity: string
  timestamp: number
}

/**
 * Processes screenshots through VLM understanding.
 * Single responsibility: call VLM provider and structure the output.
 * pHash computation is handled separately by the pipeline.
 */
export class ScreenshotProcessor {
  private vlmProvider: VlmProvider

  constructor(vlmProvider: VlmProvider) {
    this.vlmProvider = vlmProvider
  }

  /**
   * Process a screenshot through VLM for content understanding.
   */
  async process(screenshot: ScreenshotResult): Promise<ScreenshotUnderstanding> {
    try {
      const vlmResult: VlmResult = await this.vlmProvider.describeImage(screenshot.buffer)

      return {
        description: vlmResult.description,
        entities: vlmResult.entities,
        activity: vlmResult.activity,
        timestamp: screenshot.timestamp,
      }
    }
    catch (error) {
      throw new Error('Screenshot processing failed', { cause: error })
    }
  }
}
