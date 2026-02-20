import type { ScreenshotProvider } from '../types'

import { describe, expect, it } from 'vitest'

import { ScreenshotCapture } from '../capture/screenshot'

// Test Double rationale: Electron desktopCapturer API is not available
// in Node.js test environment. This is an external platform API boundary.
class FixedBufferScreenshotProvider implements ScreenshotProvider {
  private buffer: Buffer

  constructor(buffer?: Buffer) {
    this.buffer = buffer ?? Buffer.from('fake-screenshot-data-for-testing')
  }

  async capture(): Promise<Buffer> {
    return this.buffer
  }
}

describe('screenshotCapture', () => {
  it('capture() returns a ScreenshotResult with non-empty Buffer', async () => {
    const provider = new FixedBufferScreenshotProvider()
    const capture = new ScreenshotCapture(provider)

    const result = await capture.capture()

    expect(result.buffer).toBeInstanceOf(Buffer)
    expect(result.buffer.length).toBeGreaterThan(0)
  })

  it('capture() returns the buffer from the provider', async () => {
    const expectedBuffer = Buffer.from('specific-test-data')
    const provider = new FixedBufferScreenshotProvider(expectedBuffer)
    const capture = new ScreenshotCapture(provider)

    const result = await capture.capture()

    expect(result.buffer).toEqual(expectedBuffer)
  })

  it('capture() returns a timestamp', async () => {
    const provider = new FixedBufferScreenshotProvider()
    const capture = new ScreenshotCapture(provider)

    const before = Date.now()
    const result = await capture.capture()
    const after = Date.now()

    expect(result.timestamp).toBeGreaterThanOrEqual(before)
    expect(result.timestamp).toBeLessThanOrEqual(after)
  })

  it('capture() wraps provider errors with diagnostic context', async () => {
    // Test Double rationale: Simulates platform API failure (e.g., no screen recording permission)
    const failingProvider: ScreenshotProvider = {
      async capture(): Promise<Buffer> {
        throw new Error('No screen sources available')
      },
    }
    const capture = new ScreenshotCapture(failingProvider)

    await expect(capture.capture()).rejects.toThrow('Screenshot capture failed')
    await expect(capture.capture()).rejects.toSatisfy((error: Error) => {
      return error.cause instanceof Error && error.cause.message === 'No screen sources available'
    })
  })
})
