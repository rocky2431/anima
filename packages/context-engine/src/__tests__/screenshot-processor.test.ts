import type { ScreenshotUnderstanding } from '../processing/screenshot-processor'
import type { VlmProvider, VlmResult } from '../types'

import { describe, expect, it } from 'vitest'

import { ScreenshotProcessor } from '../processing/screenshot-processor'

// Test Double rationale: VLM is an external API boundary (LLM service).
// The actual LLM call goes to OpenAI/Anthropic/etc. and costs money.
// We verify the processing/structuring logic, not the LLM itself.
class StubVlmProvider implements VlmProvider {
  private result: VlmResult

  constructor(result?: Partial<VlmResult>) {
    this.result = {
      description: result?.description ?? 'User is writing code in VS Code',
      entities: result?.entities ?? ['VS Code', 'TypeScript', 'terminal'],
      activity: result?.activity ?? 'coding',
    }
  }

  async describeImage(_imageBuffer: Buffer): Promise<VlmResult> {
    return this.result
  }
}

describe('screenshotProcessor', () => {
  it('returns a ScreenshotUnderstanding with all fields', async () => {
    const provider = new StubVlmProvider()
    const processor = new ScreenshotProcessor(provider)

    const result = await processor.process({
      buffer: Buffer.from('fake-image-data'),
      timestamp: 1700000000000,
    })

    expect(result).toMatchObject({
      description: 'User is writing code in VS Code',
      entities: ['VS Code', 'TypeScript', 'terminal'],
      activity: 'coding',
      timestamp: 1700000000000,
    } satisfies ScreenshotUnderstanding)
  })

  it('preserves the original timestamp', async () => {
    const provider = new StubVlmProvider()
    const processor = new ScreenshotProcessor(provider)
    const timestamp = Date.now()

    const result = await processor.process({
      buffer: Buffer.from('test-data'),
      timestamp,
    })

    expect(result.timestamp).toBe(timestamp)
  })

  it('passes image buffer to VLM provider', async () => {
    const receivedBuffers: Buffer[] = []
    const spyProvider: VlmProvider = {
      async describeImage(imageBuffer: Buffer): Promise<VlmResult> {
        receivedBuffers.push(imageBuffer)
        return {
          description: 'test',
          entities: [],
          activity: 'unknown',
        }
      },
    }

    const processor = new ScreenshotProcessor(spyProvider)
    const inputBuffer = Buffer.from('specific-test-image')

    await processor.process({
      buffer: inputBuffer,
      timestamp: Date.now(),
    })

    expect(receivedBuffers).toHaveLength(1)
    expect(receivedBuffers[0]).toEqual(inputBuffer)
  })

  it('wraps VLM provider errors with context', async () => {
    const failingProvider: VlmProvider = {
      async describeImage(): Promise<VlmResult> {
        throw new Error('API rate limit exceeded')
      },
    }

    const processor = new ScreenshotProcessor(failingProvider)

    await expect(
      processor.process({
        buffer: Buffer.from('test'),
        timestamp: Date.now(),
      }),
    ).rejects.toSatisfy((error: Error) => {
      return error.message === 'Screenshot processing failed'
        && error.cause instanceof Error
        && error.cause.message === 'API rate limit exceeded'
    })
  })
})
