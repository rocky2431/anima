import type { ScreenshotProvider, ScreenshotResult } from '../types'

/**
 * Captures screenshots using a pluggable ScreenshotProvider.
 * This is the Imperative Shell — it wraps the external platform API.
 */
export class ScreenshotCapture {
  private provider: ScreenshotProvider

  constructor(provider: ScreenshotProvider) {
    this.provider = provider
  }

  /**
   * Capture a screenshot and return the result.
   * Wraps provider errors with diagnostic context.
   */
  async capture(): Promise<ScreenshotResult> {
    try {
      const buffer = await this.provider.capture()
      return {
        buffer,
        timestamp: Date.now(),
      }
    }
    catch (error) {
      throw new Error('Screenshot capture failed', { cause: error })
    }
  }
}
