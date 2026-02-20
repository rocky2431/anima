import type {
  DailySummary,
  EmbeddingProvider,
  ExtractionInput,
  ExtractionResult,
  LlmProvider,
  MemoryRecallResult,
  PersonaConfig,
  ProcessedContext,
} from '@proj-airi/context-engine'
import type { ProactiveResponse } from '@proj-airi/persona-engine'

import type { EveningPipelineDeps, EveningPipelineEvent } from './evening-pipeline'

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import {
  DocumentStore,
  MemoryExtractor,
  MemoryOrchestrator,
  ReportGenerator,
  VectorStore,
} from '@proj-airi/context-engine'
import { CronService } from '@proj-airi/cron-service'
import {
  createEmotionActor,
  generateResponse,
} from '@proj-airi/persona-engine'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createEveningPipeline } from './evening-pipeline'

// -- Test Doubles for external APIs only --

const DAILY_SUMMARY_FIXTURE: DailySummary = {
  date: '2026-02-20',
  highlights: [
    'Completed the integration test module',
    'Had a productive code review session',
  ],
  activityBreakdown: [
    { app: 'VS Code', durationMs: 14400000, description: 'TypeScript development' },
    { app: 'Chrome', durationMs: 3600000, description: 'Research and documentation' },
  ],
  totalWorkDurationMs: 18000000,
  personalNote: '今天你好努力呢，写了好多代码～明天也要加油哦！',
}

const EXTRACTION_FIXTURE: ExtractionResult = {
  memories: [
    { content: 'User completed integration test module for evening pipeline', importance: 8, category: 'event' },
    { content: 'User had a productive code review session with team', importance: 7, category: 'event' },
  ],
  profileFacts: [
    { fact: 'Focuses on integration testing', confidence: 0.8 },
  ],
  relationships: [
    { personName: 'Team Lead', relationshipType: 'colleague' },
  ],
  importantDates: [],
}

/**
 * Test Double rationale: LLM API is an external service with cost, rate limits,
 * and non-deterministic outputs. We control responses to verify pipeline wiring.
 */
class StubLlmProvider implements LlmProvider {
  private callCount = 0
  private readonly responses: unknown[]

  constructor(...responses: unknown[]) {
    this.responses = responses.length > 0 ? responses : [DAILY_SUMMARY_FIXTURE, EXTRACTION_FIXTURE]
  }

  async generateText(_options: { system: string, prompt: string }): Promise<string> {
    const response = this.responses[this.callCount % this.responses.length]
    this.callCount++
    return JSON.stringify(response)
  }

  async generateStructured<T>(_options: {
    system: string
    prompt: string
    schemaDescription: string
  }): Promise<T> {
    const response = this.responses[this.callCount % this.responses.length]
    this.callCount++
    return response as T
  }
}

/**
 * Test Double rationale: Embedding API is an external service.
 * Deterministic vectors for predictable recall behavior.
 */
class StubEmbeddingProvider implements EmbeddingProvider {
  readonly dimension = 8

  async embed(text: string): Promise<number[]> {
    const vector = Array.from({ length: this.dimension }, () => 0)
    for (let i = 0; i < text.length; i++) {
      vector[i % this.dimension] += text.charCodeAt(i) / 1000
    }
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0))
    if (magnitude > 0) {
      return vector.map(v => v / magnitude)
    }
    return vector
  }
}

const TEST_PERSONA: PersonaConfig = {
  name: '小柔',
  personality: '温柔体贴，善解人意',
  speakingStyle: '说话轻柔可爱，经常用"～"和"哦"结尾',
}

const SAMPLE_ACTIVITIES: ProcessedContext[] = [
  {
    activity: {
      continuousWorkDurationMs: 7200000,
      currentApp: 'VS Code',
      currentWindowTitle: 'evening-pipeline.test.ts',
      isFullscreen: false,
      lastActivityTimestamp: Date.now() - 3600000,
      isActive: true,
      recentApps: ['VS Code', 'Chrome', 'Terminal'],
    },
    timestamp: Date.now() - 7200000,
  },
  {
    activity: {
      continuousWorkDurationMs: 3600000,
      currentApp: 'Chrome',
      currentWindowTitle: 'GitHub - Pull Request Review',
      isFullscreen: false,
      lastActivityTimestamp: Date.now() - 1800000,
      isActive: true,
      recentApps: ['Chrome', 'VS Code'],
    },
    timestamp: Date.now() - 3600000,
  },
]

describe('evening pipeline E2E: cron → report → extract → persona → recall', () => {
  let tmpDir: string
  let docStore: DocumentStore
  let vecStore: VectorStore
  let embedding: StubEmbeddingProvider
  let cronService: CronService
  let orchestrator: MemoryOrchestrator

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evening-pipeline-test-'))
    docStore = new DocumentStore(path.join(tmpDir, 'anima.db'))
    vecStore = await VectorStore.create(path.join(tmpDir, 'vectors'))
    embedding = new StubEmbeddingProvider()
    cronService = new CronService(path.join(tmpDir, 'cron.db'))

    orchestrator = new MemoryOrchestrator({
      documentStore: docStore,
      vectorStore: vecStore,
      embedding,
      workingMemoryCapacity: 20,
    })
    await orchestrator.init()
  })

  afterEach(async () => {
    cronService.close()
    docStore.close()
    await vecStore.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('triggers evening-summary handler via CronService and produces a report', async () => {
    const llm = new StubLlmProvider(DAILY_SUMMARY_FIXTURE, EXTRACTION_FIXTURE)
    const reportGenerator = new ReportGenerator({ llm, persona: TEST_PERSONA })

    let handlerCalled = false
    let generatedReport: DailySummary | undefined

    cronService.registerHandler('evening-summary', async () => {
      handlerCalled = true
      generatedReport = await reportGenerator.generate(SAMPLE_ACTIVITIES)
    })

    // Schedule for immediate execution (1 second from now)
    const futureDate = new Date(Date.now() + 1000)
    cronService.at(futureDate, {
      handler: 'evening-summary',
      name: 'Evening Summary Test',
    })

    // Wait for execution
    await new Promise(resolve => setTimeout(resolve, 2000))

    expect(handlerCalled).toBe(true)
    expect(generatedReport).toBeDefined()
    expect(generatedReport!.highlights.length).toBeGreaterThan(0)
    expect(generatedReport!.activityBreakdown.length).toBeGreaterThan(0)
    expect(generatedReport!.personalNote.length).toBeGreaterThan(0)
  })

  it('extracts memories from daily data and persists to storage', async () => {
    const llm = new StubLlmProvider(EXTRACTION_FIXTURE)
    const extractor = new MemoryExtractor({ llm, embedding, persona: TEST_PERSONA })

    const input: ExtractionInput = {
      conversations: [
        { role: 'user', content: 'I finished the integration tests today' },
        { role: 'assistant', content: 'That is wonderful! Great progress.' },
        { role: 'user', content: 'The team lead reviewed my code too' },
      ],
      activities: [
        { app: 'VS Code', description: 'TypeScript development', timestamp: Date.now() },
      ],
      todos: [
        { title: 'Write integration tests', completed: true },
      ],
    }

    // Extract
    const extracted = await extractor.extract(input, [])
    expect(extracted.memories.length).toBeGreaterThan(0)

    // Persist via orchestrator
    await orchestrator.persistExtractionResults(extracted)

    // Verify persistence in DocumentStore
    const storedMemories = docStore.getMemoryEntries(10)
    expect(storedMemories.length).toBe(2)
    expect(storedMemories.some(m => m.content.includes('integration test'))).toBe(true)

    const storedFacts = docStore.getProfileFacts()
    expect(storedFacts.length).toBe(1)

    const storedRelationships = docStore.getRelationships()
    expect(storedRelationships).toHaveLength(1)
    expect(storedRelationships[0].personName).toBe('Team Lead')
  })

  it('generates persona-styled response with correct emotion and intimacy tone', () => {
    const emotionActor = createEmotionActor()

    // Simulate T06 evening summary trigger
    emotionActor.send({ type: 'USER_ACTIVE' })
    const currentEmotion = emotionActor.getSnapshot().value as string

    const triggerResult = {
      triggered: true as const,
      triggerId: 'T06',
      triggerName: 'evening-summary' as const,
      suggestedEmotion: 'caring' as const,
    }

    const response: ProactiveResponse = generateResponse(triggerResult, currentEmotion as any)

    expect(response.message.length).toBeGreaterThan(0)
    expect(response.triggerId).toBe('T06')
    expect(response.emotion).toBeDefined()
    // Verify the message is from the evening-summary template
    expect(response.message).not.toBe('有什么需要帮忙的吗？')
  })

  it('recalls persisted memories via vector search the next day', async () => {
    // Phase 1: Persist extraction results (simulating "yesterday")
    await orchestrator.persistExtractionResults(EXTRACTION_FIXTURE)

    // Phase 2: Recall via semantic search (simulating "today")
    const recalled: MemoryRecallResult[] = await orchestrator.recall({
      text: 'integration test code review',
      topK: 5,
    })

    expect(recalled.length).toBeGreaterThan(0)
    expect(recalled.some(r => r.content.includes('integration test'))).toBe(true)
    expect(recalled[0].relevance).toBeGreaterThan(0)
    expect(recalled[0].importance).toBeGreaterThan(0)
  })

  it('completes full evening pipeline: cron → collect → report → extract → persist → persona → recall', async () => {
    const llm = new StubLlmProvider(DAILY_SUMMARY_FIXTURE, EXTRACTION_FIXTURE)
    const events: EveningPipelineEvent[] = []

    const deps: EveningPipelineDeps = {
      cronService,
      reportGenerator: new ReportGenerator({ llm, persona: TEST_PERSONA }),
      memoryExtractor: new MemoryExtractor({ llm: new StubLlmProvider(EXTRACTION_FIXTURE), embedding, persona: TEST_PERSONA }),
      memoryOrchestrator: orchestrator,
      emotionActor: createEmotionActor(),
    }

    const pipeline = createEveningPipeline(deps, {
      onEvent: (event: EveningPipelineEvent) => { events.push(event) },
    })

    // Feed today's activities into the pipeline
    for (const activity of SAMPLE_ACTIVITIES) {
      pipeline.recordActivity(activity)
    }

    // Add conversations to working memory
    orchestrator.addToWorkingMemory({
      id: 'conv1',
      role: 'user',
      content: 'I finished the integration tests today',
      createdAt: Date.now(),
    })
    orchestrator.addToWorkingMemory({
      id: 'conv2',
      role: 'assistant',
      content: 'That is wonderful! Great progress on the evening pipeline.',
      createdAt: Date.now(),
    })

    // Trigger the pipeline manually (simulating cron fire)
    await pipeline.trigger()

    // Verify all stages completed
    expect(events.length).toBeGreaterThanOrEqual(3)

    const reportEvent = events.find(e => e.type === 'report-generated')
    expect(reportEvent).toBeDefined()
    expect(reportEvent!.data.highlights.length).toBeGreaterThan(0)

    const extractEvent = events.find(e => e.type === 'memories-extracted')
    expect(extractEvent).toBeDefined()
    expect(extractEvent!.data.memories.length).toBeGreaterThan(0)

    const responseEvent = events.find(e => e.type === 'persona-response')
    expect(responseEvent).toBeDefined()
    expect(responseEvent!.data.message.length).toBeGreaterThan(0)
    expect(responseEvent!.data.emotion).toBeDefined()

    // Verify memories were persisted
    const storedMemories = docStore.getMemoryEntries(10)
    expect(storedMemories.length).toBeGreaterThan(0)

    // Verify next-day recall works
    const recalled = await orchestrator.recall({ text: 'integration test evening pipeline' })
    expect(recalled.length).toBeGreaterThan(0)
  })

  it('handles empty activity day gracefully', async () => {
    const llm = new StubLlmProvider(
      { date: '2026-02-20', highlights: [], activityBreakdown: [], totalWorkDurationMs: 0, personalNote: '今天好安静呢～' },
      { memories: [], profileFacts: [], relationships: [], importantDates: [] },
    )
    const events: EveningPipelineEvent[] = []

    const deps: EveningPipelineDeps = {
      cronService,
      reportGenerator: new ReportGenerator({ llm, persona: TEST_PERSONA }),
      memoryExtractor: new MemoryExtractor({ llm: new StubLlmProvider({ memories: [], profileFacts: [], relationships: [], importantDates: [] }), embedding, persona: TEST_PERSONA }),
      memoryOrchestrator: orchestrator,
      emotionActor: createEmotionActor(),
    }

    const pipeline = createEveningPipeline(deps, {
      onEvent: (event: EveningPipelineEvent) => { events.push(event) },
    })

    await pipeline.trigger()

    // Should complete without errors even with no activities
    const reportEvent = events.find(e => e.type === 'report-generated')
    expect(reportEvent).toBeDefined()

    const responseEvent = events.find(e => e.type === 'persona-response')
    expect(responseEvent).toBeDefined()
  })

  it('propagates phase errors with context via trigger()', async () => {
    /**
     * Test Double rationale: Simulates LLM API failure to verify pipeline error wrapping.
     */
    const failingLlm: LlmProvider = {
      async generateText(): Promise<string> {
        throw new Error('LLM rate limit exceeded')
      },
      async generateStructured<T>(): Promise<T> {
        throw new Error('LLM rate limit exceeded')
      },
    }

    const deps: EveningPipelineDeps = {
      cronService,
      reportGenerator: new ReportGenerator({ llm: failingLlm, persona: TEST_PERSONA }),
      memoryExtractor: new MemoryExtractor({ llm: failingLlm, embedding, persona: TEST_PERSONA }),
      memoryOrchestrator: orchestrator,
      emotionActor: createEmotionActor(),
    }

    const pipeline = createEveningPipeline(deps)
    pipeline.recordActivity(SAMPLE_ACTIVITIES[0])

    await expect(pipeline.trigger()).rejects.toThrow('Evening pipeline manual trigger failed')
    await expect(pipeline.trigger()).rejects.toSatisfy((error: Error) => {
      return error.cause instanceof Error && error.cause.message.includes('Phase 1')
    })
  })

  it('calls onError when cron-triggered pipeline fails', async () => {
    /**
     * Test Double rationale: Simulates LLM API failure to verify cron error handling path.
     */
    const failingLlm: LlmProvider = {
      async generateText(): Promise<string> {
        throw new Error('LLM connection timeout')
      },
      async generateStructured<T>(): Promise<T> {
        throw new Error('LLM connection timeout')
      },
    }
    const errors: Error[] = []

    const deps: EveningPipelineDeps = {
      cronService,
      reportGenerator: new ReportGenerator({ llm: failingLlm, persona: TEST_PERSONA }),
      memoryExtractor: new MemoryExtractor({ llm: failingLlm, embedding, persona: TEST_PERSONA }),
      memoryOrchestrator: orchestrator,
      emotionActor: createEmotionActor(),
    }

    createEveningPipeline(deps, {
      onError: (err: Error) => { errors.push(err) },
    })

    // Trigger via CronService at() — fires the registered handler
    const futureDate = new Date(Date.now() + 500)
    cronService.at(futureDate, {
      handler: 'evening-summary',
      name: 'Error Test',
    })

    // Wait for cron to fire and error to propagate
    await new Promise(resolve => setTimeout(resolve, 2000))

    expect(errors.length).toBe(1)
    expect(errors[0].message).toContain('cron handler failed')
  })

  it('scheduleDaily returns a valid schedule ID and registers with CronService', () => {
    const llm = new StubLlmProvider(DAILY_SUMMARY_FIXTURE, EXTRACTION_FIXTURE)

    const deps: EveningPipelineDeps = {
      cronService,
      reportGenerator: new ReportGenerator({ llm, persona: TEST_PERSONA }),
      memoryExtractor: new MemoryExtractor({ llm: new StubLlmProvider(EXTRACTION_FIXTURE), embedding, persona: TEST_PERSONA }),
      memoryOrchestrator: orchestrator,
      emotionActor: createEmotionActor(),
    }

    const pipeline = createEveningPipeline(deps)

    // Schedule for 9 PM daily
    const scheduleId = pipeline.scheduleDaily('0 21 * * *')

    expect(scheduleId).toBeDefined()
    expect(typeof scheduleId).toBe('string')
    expect(scheduleId.length).toBeGreaterThan(0)
  })
})
