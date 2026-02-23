import type { Message } from '../types/ai-messages'
import type { StreamEvent, StreamOptions } from './llm'
import type { ChatProvider } from './providers/types'

import { env } from 'node:process'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Test Double rationale: AI SDK streamText makes external LLM API calls to LLM providers.
// We stub the AI SDK module to test our event-mapping and promise-settlement logic
// without requiring a real LLM endpoint.
vi.mock('ai', async (importOriginal) => {
  const original = await importOriginal<typeof import('ai')>()
  return {
    ...original,
    streamText: vi.fn(),
  }
})

// Test Double rationale: mcp() and debug() connect to external MCP servers and load
// tool registries — IO operations outside the unit boundary.
vi.mock('../tools', () => ({
  mcp: vi.fn(async () => []),
  debug: vi.fn(async () => []),
}))

// Test Double rationale: useConsciousnessStore is a Pinia store requiring Vue app context.
// We stub it to isolate the LLM store streaming logic.
vi.mock('./modules/consciousness', () => ({
  useConsciousnessStore: vi.fn(() => ({ useAiSdk: false })),
}))

const TEST_BASE_URL = env.TEST_AI_SDK_BASE_URL ?? 'test-provider-base-url'
const TEST_API_KEY = env.TEST_AI_SDK_API_KEY ?? 'sk-test-key'

function createMockChatProvider(overrides?: Partial<{ baseURL: string, apiKey: string, headers: Record<string, string> }>): ChatProvider {
  return {
    chat: (_model: string) => ({
      baseURL: overrides?.baseURL ?? TEST_BASE_URL,
      apiKey: overrides?.apiKey ?? TEST_API_KEY,
      headers: overrides?.headers ?? {},
      model: _model,
    }),
  } as unknown as ChatProvider
}

const testMessages: Message[] = [{ role: 'user', content: 'Hello' }]

describe('streamFromAiSdk', () => {
  let streamTextMock: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    const ai = await import('ai')
    streamTextMock = ai.streamText as ReturnType<typeof vi.fn>
    streamTextMock.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should reject when baseURL is empty', async () => {
    const { streamFromAiSdk } = await import('./llm')
    const provider = createMockChatProvider({ baseURL: '' })

    await expect(
      streamFromAiSdk('test-model', provider, testMessages),
    ).rejects.toThrow('AI SDK stream requires a baseURL')
  })

  it('should reject when apiKey is empty', async () => {
    const { streamFromAiSdk } = await import('./llm')
    const provider = createMockChatProvider({ apiKey: '' })

    await expect(
      streamFromAiSdk('test-model', provider, testMessages),
    ).rejects.toThrow('AI SDK stream requires an apiKey')
  })

  it('should forward text-delta chunks via onStreamEvent', async () => {
    const { streamFromAiSdk } = await import('./llm')
    const events: StreamEvent[] = []

    // Mock returns synchronously (aiSdkStreamText is not awaited in the code)
    streamTextMock.mockImplementation((opts: any) => {
      queueMicrotask(async () => {
        await opts.onChunk({ chunk: { type: 'text-delta', text: 'Hello ' } })
        await opts.onChunk({ chunk: { type: 'text-delta', text: 'world' } })
        await opts.onFinish({ finishReason: 'stop' })
      })
      // text never resolves — promise settles via onFinish
      return { text: new Promise(() => {}) }
    })

    const provider = createMockChatProvider()
    await streamFromAiSdk('test-model', provider, testMessages, {
      onStreamEvent: async (event) => { events.push(event) },
    })

    expect(events).toContainEqual({ type: 'text-delta', text: 'Hello ' })
    expect(events).toContainEqual({ type: 'text-delta', text: 'world' })
    expect(events).toContainEqual({ type: 'finish', finishReason: 'stop' })
  })

  it('should convert tool-call chunks with JSON.stringify(input) for args', async () => {
    const { streamFromAiSdk } = await import('./llm')
    const events: StreamEvent[] = []

    streamTextMock.mockImplementation((opts: any) => {
      queueMicrotask(async () => {
        await opts.onChunk({
          chunk: {
            type: 'tool-call',
            toolName: 'search',
            toolCallId: 'call-123',
            input: { query: 'test' },
          },
        })
        await opts.onFinish({ finishReason: 'tool-calls' })
      })
      return { text: new Promise(() => {}) }
    })

    const provider = createMockChatProvider()
    await streamFromAiSdk('test-model', provider, testMessages, {
      onStreamEvent: async (event) => { events.push(event) },
    })

    const toolCallEvent = events.find(e => e.type === 'tool-call')
    expect(toolCallEvent).toBeDefined()
    expect((toolCallEvent as any).toolName).toBe('search')
    expect((toolCallEvent as any).toolCallId).toBe('call-123')
    expect((toolCallEvent as any).args).toBe(JSON.stringify({ query: 'test' }))
    expect((toolCallEvent as any).toolCallType).toBe('function')
  })

  it('should forward tool-result chunks with toolCallId and output', async () => {
    const { streamFromAiSdk } = await import('./llm')
    const events: StreamEvent[] = []

    streamTextMock.mockImplementation((opts: any) => {
      queueMicrotask(async () => {
        await opts.onChunk({
          chunk: {
            type: 'tool-result',
            toolCallId: 'call-456',
            output: 'result data',
          },
        })
        await opts.onFinish({ finishReason: 'stop' })
      })
      return { text: new Promise(() => {}) }
    })

    const provider = createMockChatProvider()
    await streamFromAiSdk('test-model', provider, testMessages, {
      onStreamEvent: async (event) => { events.push(event) },
    })

    const resultEvent = events.find(e => e.type === 'tool-result')
    expect(resultEvent).toBeDefined()
    expect((resultEvent as any).toolCallId).toBe('call-456')
    expect((resultEvent as any).result).toBe('result data')
  })

  it('should NOT resolve when finishReason is tool-calls and waitForTools is true', async () => {
    const { streamFromAiSdk } = await import('./llm')
    let resolved = false

    streamTextMock.mockImplementation((opts: any) => {
      queueMicrotask(async () => {
        await opts.onFinish({ finishReason: 'tool-calls' })
      })
      return { text: new Promise(() => {}) }
    })

    const provider = createMockChatProvider()
    const options: StreamOptions = {
      waitForTools: true,
      onStreamEvent: async () => {},
    }

    const streamPromise = streamFromAiSdk('test-model', provider, testMessages, options)
    streamPromise.then(() => { resolved = true })

    // Wait a tick to let the async callbacks execute
    await new Promise(r => setTimeout(r, 50))
    expect(resolved).toBe(false)
  })

  it('should resolve when finishReason is tool-calls and waitForTools is false', async () => {
    const { streamFromAiSdk } = await import('./llm')

    streamTextMock.mockImplementation((opts: any) => {
      queueMicrotask(async () => {
        await opts.onFinish({ finishReason: 'tool-calls' })
      })
      return { text: new Promise(() => {}) }
    })

    const provider = createMockChatProvider()
    const options: StreamOptions = {
      waitForTools: false,
      onStreamEvent: async () => {},
    }

    await expect(
      streamFromAiSdk('test-model', provider, testMessages, options),
    ).resolves.toBeUndefined()
  })

  it('should reject via onError and still call onStreamEvent', async () => {
    const { streamFromAiSdk } = await import('./llm')
    const events: StreamEvent[] = []
    const testError = new Error('LLM provider error')

    streamTextMock.mockImplementation((opts: any) => {
      queueMicrotask(async () => {
        await opts.onError({ error: testError })
      })
      return { text: new Promise(() => {}) }
    })

    const provider = createMockChatProvider()
    await expect(
      streamFromAiSdk('test-model', provider, testMessages, {
        onStreamEvent: async (event) => { events.push(event) },
      }),
    ).rejects.toThrow('LLM provider error')

    expect(events).toContainEqual({ type: 'error', error: testError })
  })

  it('should still reject via onError even when onStreamEvent callback throws', async () => {
    const { streamFromAiSdk } = await import('./llm')
    const testError = new Error('Provider failed')

    streamTextMock.mockImplementation((opts: any) => {
      queueMicrotask(async () => {
        await opts.onError({ error: testError })
      })
      return { text: new Promise(() => {}) }
    })

    const provider = createMockChatProvider()
    await expect(
      streamFromAiSdk('test-model', provider, testMessages, {
        onStreamEvent: async () => { throw new Error('callback crashed') },
      }),
    ).rejects.toThrow('Provider failed')
  })

  it('should resolve via result.text fallback when onFinish does not fire', async () => {
    const { streamFromAiSdk } = await import('./llm')

    streamTextMock.mockImplementation(() => {
      return { text: Promise.resolve('done') }
    })

    const provider = createMockChatProvider()
    await expect(
      streamFromAiSdk('test-model', provider, testMessages),
    ).resolves.toBeUndefined()
  })

  it('should reject onChunk callback error via rejectOnce', async () => {
    const { streamFromAiSdk } = await import('./llm')
    const callbackError = new Error('Callback processing failed')

    streamTextMock.mockImplementation((opts: any) => {
      queueMicrotask(async () => {
        await opts.onChunk({ chunk: { type: 'text-delta', text: 'hi' } })
      })
      return { text: new Promise(() => {}) }
    })

    const provider = createMockChatProvider()
    await expect(
      streamFromAiSdk('test-model', provider, testMessages, {
        onStreamEvent: async () => { throw callbackError },
      }),
    ).rejects.toThrow('Callback processing failed')
  })
})

describe('stream() routing', () => {
  let streamTextMock: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    const ai = await import('ai')
    streamTextMock = ai.streamText as ReturnType<typeof vi.fn>
    streamTextMock.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should route to AI SDK streamText (now the only path)', async () => {
    const { streamFromAiSdk } = await import('./llm')

    streamTextMock.mockImplementation((opts: any) => {
      queueMicrotask(async () => {
        await opts.onFinish({ finishReason: 'stop' })
      })
      return { text: new Promise(() => {}) }
    })

    const provider = createMockChatProvider()
    await streamFromAiSdk('test-model', provider, testMessages, {
      onStreamEvent: async () => {},
    })

    expect(streamTextMock).toHaveBeenCalledTimes(1)
  })
})
