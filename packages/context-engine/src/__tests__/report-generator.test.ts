import type { DailySummary, LlmProvider, PersonaConfig, ProcessedContext } from '../types'

import { describe, expect, it } from 'vitest'

import { ReportGenerator } from '../consumption/report-generator'

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

describe('reportGenerator', () => {
  const SAMPLE_SUMMARY: DailySummary = {
    date: '2026-02-19',
    highlights: ['完成了编辑器功能开发', '浏览了技术文档'],
    activityBreakdown: [
      { app: 'VS Code', durationMs: 7200000, description: '编写代码' },
      { app: 'Chrome', durationMs: 3600000, description: '查阅文档' },
    ],
    totalWorkDurationMs: 10800000,
    personalNote: '今天效率很高呢～辛苦了！',
  }

  describe('generate', () => {
    it('generates a daily summary from activity data', async () => {
      const llm = new StubLlmProvider(SAMPLE_SUMMARY)
      const generator = new ReportGenerator({ llm, persona: TEST_PERSONA })

      const base = Date.now()
      const activities = [
        makeProcessedContext(base, {
          activity: {
            currentApp: 'VS Code',
            currentWindowTitle: 'editor.ts',
            isActive: true,
            continuousWorkDurationMs: 3600000,
            recentApps: ['VS Code'],
            lastActivityTimestamp: base,
            isFullscreen: false,
          },
        }),
        makeProcessedContext(base + 3600000, {
          activity: {
            currentApp: 'Chrome',
            currentWindowTitle: 'MDN Docs',
            isActive: true,
            continuousWorkDurationMs: 7200000,
            recentApps: ['Chrome', 'VS Code'],
            lastActivityTimestamp: base + 3600000,
            isFullscreen: false,
          },
        }),
      ]

      const result = await generator.generate(activities)

      expect(result.highlights).toHaveLength(2)
      expect(result.activityBreakdown).toHaveLength(2)
      expect(result.totalWorkDurationMs).toBe(10800000)
      expect(result.personalNote).toBeTruthy()
      expect(result.date).toBe('2026-02-19')
    })

    it('includes persona context in LLM system prompt', async () => {
      const llm = new StubLlmProvider(SAMPLE_SUMMARY)
      const generator = new ReportGenerator({ llm, persona: TEST_PERSONA })

      await generator.generate([makeProcessedContext(Date.now())])

      expect(llm.calls).toHaveLength(1)
      expect(llm.calls[0].system).toContain('小柔')
      expect(llm.calls[0].system).toContain('温柔体贴')
      expect(llm.calls[0].system).toContain('说话轻柔')
    })

    it('includes activity data in LLM user prompt', async () => {
      const llm = new StubLlmProvider(SAMPLE_SUMMARY)
      const generator = new ReportGenerator({ llm, persona: TEST_PERSONA })

      const base = Date.now()
      const activities = [
        makeProcessedContext(base, {
          activity: {
            currentApp: 'VS Code',
            currentWindowTitle: 'main.ts',
            isActive: true,
            continuousWorkDurationMs: 1800000,
            recentApps: ['VS Code'],
            lastActivityTimestamp: base,
            isFullscreen: false,
          },
        }),
      ]

      await generator.generate(activities)

      expect(llm.calls[0].prompt).toContain('VS Code')
      expect(llm.calls[0].prompt).toContain('main.ts')
    })

    it('includes screenshot descriptions when available', async () => {
      const llm = new StubLlmProvider(SAMPLE_SUMMARY)
      const generator = new ReportGenerator({ llm, persona: TEST_PERSONA })

      const base = Date.now()
      const activities = [
        makeProcessedContext(base, {
          screenshot: {
            description: 'User writing TypeScript code in VS Code',
            entities: ['VS Code', 'TypeScript'],
            activity: 'coding',
            timestamp: base,
            hash: '0'.repeat(64),
          },
        }),
      ]

      await generator.generate(activities)

      expect(llm.calls[0].prompt).toContain('User writing TypeScript code in VS Code')
    })

    it('returns empty summary for no activities', async () => {
      const emptySummary: DailySummary = {
        date: '2026-02-19',
        highlights: [],
        activityBreakdown: [],
        totalWorkDurationMs: 0,
        personalNote: '今天没什么活动记录呢',
      }
      const llm = new StubLlmProvider(emptySummary)
      const generator = new ReportGenerator({ llm, persona: TEST_PERSONA })

      const result = await generator.generate([])

      expect(result.highlights).toEqual([])
      expect(result.activityBreakdown).toEqual([])
      expect(result.totalWorkDurationMs).toBe(0)
    })

    it('calls onReport callback with the generated summary', async () => {
      const reports: DailySummary[] = []
      const llm = new StubLlmProvider(SAMPLE_SUMMARY)
      const generator = new ReportGenerator({
        llm,
        persona: TEST_PERSONA,
        onReport: r => reports.push(r),
      })

      await generator.generate([makeProcessedContext(Date.now())])

      expect(reports).toHaveLength(1)
      expect(reports[0].date).toBe('2026-02-19')
    })

    it('forwards errors from LLM provider to onError callback', async () => {
      const errors: Error[] = []
      const llm: LlmProvider = {
        async generateText() { throw new Error('LLM API timeout') },
        async generateStructured() { throw new Error('LLM API timeout') },
      }
      const generator = new ReportGenerator({
        llm,
        persona: TEST_PERSONA,
        onError: (err: Error) => errors.push(err),
      })

      const result = await generator.generate([makeProcessedContext(Date.now())])

      expect(errors).toHaveLength(1)
      expect(errors[0].message).toContain('ReportGenerator')
      expect(result.highlights).toEqual([])
      expect(result.totalWorkDurationMs).toBe(0)
    })

    it('re-throws LLM errors when no onError is set', async () => {
      const llm: LlmProvider = {
        async generateText() { throw new Error('LLM API timeout') },
        async generateStructured() { throw new Error('LLM API timeout') },
      }
      const generator = new ReportGenerator({ llm, persona: TEST_PERSONA })

      await expect(generator.generate([makeProcessedContext(Date.now())])).rejects.toThrow('ReportGenerator')
    })

    it('rejects invalid LLM output with validation error', async () => {
      const invalidSummary = { date: 123, highlights: 'not an array' }
      const errors: Error[] = []
      const llm = new StubLlmProvider(invalidSummary)
      const generator = new ReportGenerator({
        llm,
        persona: TEST_PERSONA,
        onError: (err: Error) => errors.push(err),
      })

      const result = await generator.generate([makeProcessedContext(Date.now())])

      expect(errors).toHaveLength(1)
      expect(errors[0].message).toContain('ReportGenerator')
      expect(result.highlights).toEqual([])
    })
  })
})
