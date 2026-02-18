import type { LlmProvider, PersonaConfig, ProcessedContext, SmartTipResult } from '../types'

import { describe, expect, it } from 'vitest'

import { SmartTip } from '../consumption/smart-tip'

/**
 * Test Double rationale: LLM API is an external service with network dependency,
 * rate limits, and non-deterministic output. We control responses to verify
 * prompt construction and result processing logic.
 */
class StubLlmProvider implements LlmProvider {
  readonly calls: Array<{ system: string, prompt: string, schemaDescription?: string }> = []
  private structuredResponse: unknown

  constructor(response: unknown) {
    this.structuredResponse = response
  }

  async generateText(options: { system: string, prompt: string }): Promise<string> {
    this.calls.push(options)
    return JSON.stringify(this.structuredResponse)
  }

  async generateStructured<T>(options: {
    system: string
    prompt: string
    schemaDescription: string
  }): Promise<T> {
    this.calls.push(options)
    return this.structuredResponse as T
  }
}

const TEST_PERSONA: PersonaConfig = {
  name: '小柔',
  personality: '温柔体贴、善解人意',
  speakingStyle: '说话轻柔，常用语气词"呢"、"嘛"、"哦"',
}

function makeProcessedContext(
  timestamp: number,
  overrides: Partial<ProcessedContext> = {},
): ProcessedContext {
  return {
    activity: {
      currentApp: 'VS Code',
      currentWindowTitle: 'editor.ts',
      isActive: true,
      continuousWorkDurationMs: 60_000,
      recentApps: ['VS Code'],
      lastActivityTimestamp: timestamp,
      isFullscreen: false,
    },
    timestamp,
    ...overrides,
  }
}

describe('smartTip', () => {
  const SAMPLE_TIP: SmartTipResult = {
    headline: '记得喝水哦～',
    note: '你已经连续工作一段时间了，站起来活动活动吧',
    kind: 'reminder',
    urgency: 'soon',
  }

  describe('generate', () => {
    it('generates a smart tip from context data', async () => {
      const llm = new StubLlmProvider(SAMPLE_TIP)
      const tip = new SmartTip({ llm, persona: TEST_PERSONA })

      const result = await tip.generate(makeProcessedContext(Date.now()))

      expect(result).not.toBeNull()
      expect(result!.headline).toBe('记得喝水哦～')
      expect(result!.note).toBeTruthy()
      expect(result!.kind).toBe('reminder')
      expect(result!.urgency).toBe('soon')
    })

    it('includes persona context in LLM system prompt', async () => {
      const llm = new StubLlmProvider(SAMPLE_TIP)
      const tip = new SmartTip({ llm, persona: TEST_PERSONA })

      await tip.generate(makeProcessedContext(Date.now()))

      expect(llm.calls).toHaveLength(1)
      expect(llm.calls[0].system).toContain('小柔')
      expect(llm.calls[0].system).toContain('温柔体贴')
    })

    it('includes activity context in LLM user prompt', async () => {
      const llm = new StubLlmProvider(SAMPLE_TIP)
      const tip = new SmartTip({ llm, persona: TEST_PERSONA })

      const now = Date.now()
      const context = makeProcessedContext(now, {
        activity: {
          currentApp: 'Chrome',
          currentWindowTitle: 'YouTube - Music',
          isActive: true,
          continuousWorkDurationMs: 7200000,
          recentApps: ['Chrome', 'Slack'],
          lastActivityTimestamp: now,
          isFullscreen: true,
        },
      })

      await tip.generate(context)

      expect(llm.calls[0].prompt).toContain('Chrome')
      expect(llm.calls[0].prompt).toContain('YouTube')
      expect(llm.calls[0].prompt).toContain('7200000')
    })

    it('returns null when LLM indicates no tip is needed', async () => {
      const llm = new StubLlmProvider(null)
      const tip = new SmartTip({ llm, persona: TEST_PERSONA })

      const result = await tip.generate(makeProcessedContext(Date.now()))

      expect(result).toBeNull()
    })

    it('validates tip result has required fields', async () => {
      const invalidTip = { headline: 'missing fields' }
      const llm = new StubLlmProvider(invalidTip)
      const tip = new SmartTip({ llm, persona: TEST_PERSONA })

      const result = await tip.generate(makeProcessedContext(Date.now()))

      expect(result).toBeNull()
    })

    it('calls onTip callback with the generated tip', async () => {
      const tips: SmartTipResult[] = []
      const llm = new StubLlmProvider(SAMPLE_TIP)
      const tip = new SmartTip({
        llm,
        persona: TEST_PERSONA,
        onTip: t => tips.push(t),
      })

      await tip.generate(makeProcessedContext(Date.now()))

      expect(tips).toHaveLength(1)
      expect(tips[0].headline).toBe('记得喝水哦～')
    })

    it('does not call onTip when result is null', async () => {
      const tips: SmartTipResult[] = []
      const llm = new StubLlmProvider(null)
      const tip = new SmartTip({
        llm,
        persona: TEST_PERSONA,
        onTip: t => tips.push(t),
      })

      await tip.generate(makeProcessedContext(Date.now()))

      expect(tips).toHaveLength(0)
    })

    it('forwards LLM errors to onError callback', async () => {
      const errors: Error[] = []
      const llm: LlmProvider = {
        async generateText() { throw new Error('LLM rate limited') },
        async generateStructured() { throw new Error('LLM rate limited') },
      }
      const tip = new SmartTip({
        llm,
        persona: TEST_PERSONA,
        onError: (err: Error) => errors.push(err),
      })

      const result = await tip.generate(makeProcessedContext(Date.now()))

      expect(result).toBeNull()
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toContain('SmartTip')
    })

    it('re-throws LLM errors when no onError is set', async () => {
      const llm: LlmProvider = {
        async generateText() { throw new Error('LLM rate limited') },
        async generateStructured() { throw new Error('LLM rate limited') },
      }
      const tip = new SmartTip({ llm, persona: TEST_PERSONA })

      await expect(tip.generate(makeProcessedContext(Date.now()))).rejects.toThrow('SmartTip')
    })

    it('invokes onError when LLM returns invalid non-null result', async () => {
      const errors: Error[] = []
      const invalidTip = { headline: 'test', kind: 'invalid_kind' }
      const llm = new StubLlmProvider(invalidTip)
      const tip = new SmartTip({
        llm,
        persona: TEST_PERSONA,
        onError: (err: Error) => errors.push(err),
      })

      const result = await tip.generate(makeProcessedContext(Date.now()))

      expect(result).toBeNull()
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toContain('invalid result structure')
    })

    it('includes screenshot context when available', async () => {
      const llm = new StubLlmProvider(SAMPLE_TIP)
      const tip = new SmartTip({ llm, persona: TEST_PERSONA })

      const now = Date.now()
      const context = makeProcessedContext(now, {
        screenshot: {
          description: 'User watching a tutorial video in browser',
          entities: ['Chrome', 'YouTube'],
          activity: 'watching',
          timestamp: now,
          hash: '0'.repeat(64),
        },
      })

      await tip.generate(context)

      expect(llm.calls[0].prompt).toContain('User watching a tutorial video in browser')
    })
  })
})
