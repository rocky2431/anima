import type { ActivityEvent, ScreenshotProvider, VlmProvider, VlmResult } from '@anase/context-engine'

import type { AnimaProactiveEvent } from './orchestrator'

import sharp from 'sharp'

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { createAnimaOrchestrator } from './orchestrator'

/**
 * Pre-generate PNG buffers for screenshot pipeline tests.
 * Real images required because the pipeline calls computePHash (sharp-based).
 */
let pngA: Buffer
let pngB: Buffer

beforeAll(async () => {
  const width = 64
  const height = 64

  const pixelsA = Buffer.alloc(width * height * 3)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3
      const val = x < width / 2 ? 0 : 255
      pixelsA[i] = val
      pixelsA[i + 1] = val
      pixelsA[i + 2] = val
    }
  }
  pngA = await sharp(pixelsA, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer()

  const pixelsB = Buffer.alloc(width * height * 3)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3
      const val = y < height / 2 ? 0 : 255
      pixelsB[i] = val
      pixelsB[i + 1] = val
      pixelsB[i + 2] = val
    }
  }
  pngB = await sharp(pixelsB, { raw: { width, height, channels: 3 } })
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

// Test Double rationale: VlmProvider is an external LLM API.
class StubVlmProvider implements VlmProvider {
  callCount = 0
  private result: VlmResult

  constructor(result?: Partial<VlmResult>) {
    this.result = {
      description: 'User is coding in VS Code',
      entities: ['VS Code', 'TypeScript'],
      activity: 'coding',
      ...result,
    }
  }

  async describeImage(_imageBuffer: Buffer): Promise<VlmResult> {
    this.callCount++
    return this.result
  }
}

function makeEvent(timestamp: number, overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    timestamp,
    appName: 'VS Code',
    windowTitle: 'editor.ts',
    isFullscreen: false,
    ...overrides,
  }
}

const TWO_HOURS_MS = 2 * 60 * 60 * 1000
const FOUR_MINUTES_MS = 4 * 60 * 1000
/** Deterministic work-hours timestamp to avoid DND quiet hours (23:00-07:00). */
const WORK_HOURS_TIME = new Date('2026-02-18T10:00:00Z').getTime()

/**
 * Generate a series of activity events at regular intervals (< 5 min gap)
 * to simulate continuous work over a given duration.
 * Events are spaced 4 minutes apart to stay within the gap threshold.
 */
function makeContinuousWorkEvents(
  endTime: number,
  durationMs: number,
  overrides: Partial<ActivityEvent> = {},
): ActivityEvent[] {
  const events: ActivityEvent[] = []
  const startTime = endTime - durationMs
  for (let t = startTime; t <= endTime; t += FOUR_MINUTES_MS) {
    events.push(makeEvent(t, overrides))
  }
  // Ensure the last event is at endTime
  if (events.length === 0 || events[events.length - 1].timestamp !== endTime) {
    events.push(makeEvent(endTime, overrides))
  }
  return events
}

describe('animaOrchestrator: end-to-end integration', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('screenshot → ActivityMonitor wiring', () => {
    it('screenshot pipeline feeds processed context to activity monitor', async () => {
      const screenshotProvider = new SequentialScreenshotProvider([pngA, pngB])
      const vlmProvider = new StubVlmProvider()

      const orchestrator = createAnimaOrchestrator(
        { screenshotProvider, vlmProvider },
        { aggregationIntervalMs: 1000 },
      )

      const now = Date.now()
      vi.setSystemTime(now)

      orchestrator.recordActivity(makeEvent(now))

      await orchestrator.tickScreenshot()

      const context = orchestrator.tickActivity()

      expect(context.screenshot).toBeDefined()
      expect(context.screenshot!.description).toBe('User is coding in VS Code')
      expect(context.screenshot!.entities).toContain('VS Code')

      orchestrator.stop()
    })
  })

  describe('activity → trigger → persona response', () => {
    it('fires rest-reminder when continuous work exceeds 2 hours', () => {
      const screenshotProvider = new SequentialScreenshotProvider([pngA])
      const vlmProvider = new StubVlmProvider()
      const proactiveEvents: AnimaProactiveEvent[] = []

      const orchestrator = createAnimaOrchestrator(
        { screenshotProvider, vlmProvider },
        {
          aggregationIntervalMs: 1000,
          initialIntimacyScore: 20,
          onProactiveResponse: (evt: AnimaProactiveEvent) => proactiveEvents.push(evt),
        },
      )

      const now = WORK_HOURS_TIME
      vi.setSystemTime(now)

      // Simulate 2h 10min of continuous work with events every 4 min
      const events = makeContinuousWorkEvents(now, TWO_HOURS_MS + 10 * 60 * 1000)
      for (const event of events) {
        orchestrator.recordActivity(event)
      }

      orchestrator.tickActivity()

      expect(proactiveEvents).toHaveLength(1)
      expect(proactiveEvents[0].response.triggerId).toBe('T03')
      expect(proactiveEvents[0].response.message).toBeTruthy()

      orchestrator.stop()
    })

    it('does not fire trigger when work duration is under 2 hours', () => {
      const screenshotProvider = new SequentialScreenshotProvider([pngA])
      const vlmProvider = new StubVlmProvider()
      const proactiveEvents: AnimaProactiveEvent[] = []

      const orchestrator = createAnimaOrchestrator(
        { screenshotProvider, vlmProvider },
        {
          aggregationIntervalMs: 1000,
          initialIntimacyScore: 20,
          onProactiveResponse: (evt: AnimaProactiveEvent) => proactiveEvents.push(evt),
        },
      )

      const now = Date.now()
      vi.setSystemTime(now)

      // Only 30 minutes of work
      const events = makeContinuousWorkEvents(now, 30 * 60 * 1000)
      for (const event of events) {
        orchestrator.recordActivity(event)
      }

      orchestrator.tickActivity()

      expect(proactiveEvents).toHaveLength(0)

      orchestrator.stop()
    })

    it('does not fire when user is fullscreen', () => {
      const screenshotProvider = new SequentialScreenshotProvider([pngA])
      const vlmProvider = new StubVlmProvider()
      const proactiveEvents: AnimaProactiveEvent[] = []

      const orchestrator = createAnimaOrchestrator(
        { screenshotProvider, vlmProvider },
        {
          aggregationIntervalMs: 1000,
          initialIntimacyScore: 20,
          onProactiveResponse: (evt: AnimaProactiveEvent) => proactiveEvents.push(evt),
        },
      )

      const now = Date.now()
      vi.setSystemTime(now)

      // 2+ hours of fullscreen work
      const events = makeContinuousWorkEvents(now, TWO_HOURS_MS + 10 * 60 * 1000, { isFullscreen: true })
      for (const event of events) {
        orchestrator.recordActivity(event)
      }

      orchestrator.tickActivity()

      expect(proactiveEvents).toHaveLength(0)

      orchestrator.stop()
    })
  })

  describe('emotion state machine integration', () => {
    it('transitions emotion on trigger fire: idle → worried via TRIGGER_CONCERN', () => {
      const screenshotProvider = new SequentialScreenshotProvider([pngA])
      const vlmProvider = new StubVlmProvider()
      const proactiveEvents: AnimaProactiveEvent[] = []

      const orchestrator = createAnimaOrchestrator(
        { screenshotProvider, vlmProvider },
        {
          aggregationIntervalMs: 1000,
          initialIntimacyScore: 20,
          onProactiveResponse: (evt: AnimaProactiveEvent) => proactiveEvents.push(evt),
        },
      )

      expect(orchestrator.getEmotionState()).toBe('idle')

      const now = WORK_HOURS_TIME
      vi.setSystemTime(now)

      const events = makeContinuousWorkEvents(now, TWO_HOURS_MS + 10 * 60 * 1000)
      for (const event of events) {
        orchestrator.recordActivity(event)
      }

      orchestrator.tickActivity()

      expect(orchestrator.getEmotionState()).toBe('worried')
      expect(proactiveEvents[0].response.emotion).toBe('worried')

      orchestrator.stop()
    })

    it('maps emotion to correct AnimaEmotion payload', () => {
      const screenshotProvider = new SequentialScreenshotProvider([pngA])
      const vlmProvider = new StubVlmProvider()
      const proactiveEvents: AnimaProactiveEvent[] = []

      const orchestrator = createAnimaOrchestrator(
        { screenshotProvider, vlmProvider },
        {
          aggregationIntervalMs: 1000,
          initialIntimacyScore: 20,
          onProactiveResponse: (evt: AnimaProactiveEvent) => proactiveEvents.push(evt),
        },
      )

      const now = WORK_HOURS_TIME
      vi.setSystemTime(now)

      const events = makeContinuousWorkEvents(now, TWO_HOURS_MS + 10 * 60 * 1000)
      for (const event of events) {
        orchestrator.recordActivity(event)
      }

      orchestrator.tickActivity()

      // worried → { name: 'sad', intensity: 0.5 }
      expect(proactiveEvents[0].animaEmotion).toEqual({
        name: 'sad',
        intensity: 0.5,
      })

      orchestrator.stop()
    })
  })

  describe('intimacy tracking', () => {
    it('tracks intimacy score through interactions', () => {
      const screenshotProvider = new SequentialScreenshotProvider([pngA])
      const vlmProvider = new StubVlmProvider()

      const orchestrator = createAnimaOrchestrator(
        { screenshotProvider, vlmProvider },
        { initialIntimacyScore: 0 },
      )

      expect(orchestrator.getIntimacy().stage).toBe('stranger')
      expect(orchestrator.getIntimacy().score).toBe(0)

      for (let i = 0; i < 16; i++) {
        orchestrator.recordInteraction('conversation')
      }

      expect(orchestrator.getIntimacy().stage).toBe('acquaintance')
      expect(orchestrator.getIntimacy().score).toBe(16)

      orchestrator.stop()
    })

    it('respects intimacy requirement: stranger cannot trigger acquaintance-level triggers', () => {
      const screenshotProvider = new SequentialScreenshotProvider([pngA])
      const vlmProvider = new StubVlmProvider()
      const proactiveEvents: AnimaProactiveEvent[] = []

      const orchestrator = createAnimaOrchestrator(
        { screenshotProvider, vlmProvider },
        {
          aggregationIntervalMs: 1000,
          initialIntimacyScore: 0,
          onProactiveResponse: (evt: AnimaProactiveEvent) => proactiveEvents.push(evt),
        },
      )

      const now = Date.now()
      vi.setSystemTime(now)

      const events = makeContinuousWorkEvents(now, TWO_HOURS_MS + 10 * 60 * 1000)
      for (const event of events) {
        orchestrator.recordActivity(event)
      }

      orchestrator.tickActivity()

      // T03 requires acquaintance, user is stranger → should not fire
      expect(proactiveEvents).toHaveLength(0)

      orchestrator.stop()
    })
  })

  describe('full end-to-end pipeline', () => {
    it('screenshot capture → VLM → activity monitor → trigger → emotion → response → UI event', async () => {
      const screenshotProvider = new SequentialScreenshotProvider([pngA])
      const vlmProvider = new StubVlmProvider({
        description: 'User has been writing code for a long time',
        entities: ['VS Code', 'TypeScript', 'Terminal'],
        activity: 'coding',
      })
      const proactiveEvents: AnimaProactiveEvent[] = []

      const orchestrator = createAnimaOrchestrator(
        { screenshotProvider, vlmProvider },
        {
          aggregationIntervalMs: 1000,
          initialIntimacyScore: 20,
          onProactiveResponse: (evt: AnimaProactiveEvent) => proactiveEvents.push(evt),
        },
      )

      const now = WORK_HOURS_TIME
      vi.setSystemTime(now)

      // Step 1: Record 2+ hours of continuous work
      const events = makeContinuousWorkEvents(now, TWO_HOURS_MS + 10 * 60 * 1000)
      for (const event of events) {
        orchestrator.recordActivity(event)
      }

      // Step 2: Screenshot pipeline captures and processes
      const screenshotProcessed = await orchestrator.tickScreenshot()
      expect(screenshotProcessed).toBe(true)
      expect(vlmProvider.callCount).toBe(1)

      // Step 3: Activity monitor aggregates and evaluates triggers
      const context = orchestrator.tickActivity()

      // Step 4: Verify full pipeline output
      expect(context.activity.continuousWorkDurationMs).toBeGreaterThan(TWO_HOURS_MS)
      expect(context.activity.currentApp).toBe('VS Code')
      expect(context.screenshot).toBeDefined()
      expect(context.screenshot!.description).toBe('User has been writing code for a long time')

      expect(proactiveEvents).toHaveLength(1)

      const event = proactiveEvents[0]
      expect(event.response.triggerId).toBe('T03')
      expect(event.response.emotion).toBe('worried')
      expect(event.response.message).toContain('连续工作')
      expect(event.animaEmotion.name).toBe('sad')
      expect(event.animaEmotion.intensity).toBe(0.5)

      // Step 5: Emotion state is now worried
      expect(orchestrator.getEmotionState()).toBe('worried')
      expect(orchestrator.getAnimaEmotion()).toEqual({ name: 'sad', intensity: 0.5 })

      orchestrator.stop()
    })
  })

  describe('lifecycle management', () => {
    it('start() initiates periodic activity aggregation ticks', () => {
      const screenshotProvider = new SequentialScreenshotProvider([pngA])
      const vlmProvider = new StubVlmProvider()
      const proactiveEvents: AnimaProactiveEvent[] = []

      const orchestrator = createAnimaOrchestrator(
        { screenshotProvider, vlmProvider },
        {
          aggregationIntervalMs: 1000,
          initialIntimacyScore: 20,
          onProactiveResponse: (evt: AnimaProactiveEvent) => proactiveEvents.push(evt),
        },
      )

      const now = WORK_HOURS_TIME
      vi.setSystemTime(now)

      const events = makeContinuousWorkEvents(now, TWO_HOURS_MS + 10 * 60 * 1000)
      for (const event of events) {
        orchestrator.recordActivity(event)
      }

      orchestrator.start()

      vi.advanceTimersByTime(1000)

      expect(proactiveEvents.length).toBeGreaterThanOrEqual(1)

      orchestrator.stop()
    })

    it('stop() halts all periodic processing', () => {
      const screenshotProvider = new SequentialScreenshotProvider([pngA])
      const vlmProvider = new StubVlmProvider()
      const proactiveEvents: AnimaProactiveEvent[] = []

      const orchestrator = createAnimaOrchestrator(
        { screenshotProvider, vlmProvider },
        {
          aggregationIntervalMs: 2000,
          initialIntimacyScore: 20,
          onProactiveResponse: (evt: AnimaProactiveEvent) => proactiveEvents.push(evt),
        },
      )

      const now = Date.now()
      vi.setSystemTime(now)

      const events = makeContinuousWorkEvents(now, TWO_HOURS_MS + 10 * 60 * 1000)
      for (const event of events) {
        orchestrator.recordActivity(event)
      }

      orchestrator.start()
      orchestrator.stop()

      const countBeforeAdvance = proactiveEvents.length
      vi.advanceTimersByTime(10000)

      expect(proactiveEvents.length).toBe(countBeforeAdvance)
    })
  })

  describe('error handling', () => {
    it('reports screenshot errors via onError', async () => {
      const failingProvider: ScreenshotProvider = {
        async capture(): Promise<Buffer> {
          throw new Error('Permission denied')
        },
      }
      const vlmProvider = new StubVlmProvider()
      const errors: Error[] = []

      const orchestrator = createAnimaOrchestrator(
        { screenshotProvider: failingProvider, vlmProvider },
        { onError: (err: Error) => errors.push(err) },
      )

      await orchestrator.tickScreenshot()

      expect(errors).toHaveLength(1)
      expect(errors[0].message).toContain('Screenshot pipeline tick failed')

      orchestrator.stop()
    })

    // Test Double rationale: VlmProvider is an external LLM API.
    it('reports VLM provider errors via onError', async () => {
      const screenshotProvider = new SequentialScreenshotProvider([pngA])
      const failingVlm: VlmProvider = {
        async describeImage(): Promise<VlmResult> {
          throw new Error('API rate limit exceeded')
        },
      }
      const errors: Error[] = []

      const orchestrator = createAnimaOrchestrator(
        { screenshotProvider, vlmProvider: failingVlm },
        { onError: (err: Error) => errors.push(err) },
      )

      await orchestrator.tickScreenshot()

      expect(errors).toHaveLength(1)
      expect(errors[0].message).toContain('Screenshot pipeline tick failed')

      orchestrator.stop()
    })

    it('catches errors thrown by onProactiveResponse callback', () => {
      const screenshotProvider = new SequentialScreenshotProvider([pngA])
      const vlmProvider = new StubVlmProvider()
      const errors: Error[] = []

      const orchestrator = createAnimaOrchestrator(
        { screenshotProvider, vlmProvider },
        {
          aggregationIntervalMs: 1000,
          initialIntimacyScore: 20,
          onProactiveResponse: () => {
            throw new Error('Callback exploded')
          },
          onError: (err: Error) => errors.push(err),
        },
      )

      const now = WORK_HOURS_TIME
      vi.setSystemTime(now)

      const events = makeContinuousWorkEvents(now, TWO_HOURS_MS + 10 * 60 * 1000)
      for (const event of events) {
        orchestrator.recordActivity(event)
      }

      // Should not throw — error routed to onError
      orchestrator.tickActivity()

      expect(errors).toHaveLength(1)
      expect(errors[0].message).toBe('Callback exploded')

      orchestrator.stop()
    })
  })

  describe('doNotDisturb integration', () => {
    it('respects DND frequency limits', () => {
      const screenshotProvider = new SequentialScreenshotProvider([pngA])
      const vlmProvider = new StubVlmProvider()
      const proactiveEvents: AnimaProactiveEvent[] = []

      const orchestrator = createAnimaOrchestrator(
        { screenshotProvider, vlmProvider },
        {
          aggregationIntervalMs: 1000,
          initialIntimacyScore: 20,
          dndConfig: {
            maxPerHour: 1,
            maxPerDay: 5,
            quietHoursStart: 23,
            quietHoursEnd: 7,
            consecutiveIgnoresForBackoff: 3,
            backoffMultiplier: 1.5,
          },
          onProactiveResponse: (evt: AnimaProactiveEvent) => proactiveEvents.push(evt),
        },
      )

      // First trigger at 10:00 — should fire
      const baseTime = new Date('2026-02-18T10:00:00Z').getTime()
      vi.setSystemTime(baseTime)

      let events = makeContinuousWorkEvents(baseTime, TWO_HOURS_MS + 10 * 60 * 1000)
      for (const event of events) {
        orchestrator.recordActivity(event)
      }
      orchestrator.tickActivity()
      expect(proactiveEvents).toHaveLength(1)

      // Second trigger attempt 5 minutes later — DND should block (maxPerHour: 1)
      const secondTime = baseTime + 5 * 60 * 1000
      vi.setSystemTime(secondTime)

      events = makeContinuousWorkEvents(secondTime, TWO_HOURS_MS + 15 * 60 * 1000)
      for (const event of events) {
        orchestrator.recordActivity(event)
      }
      orchestrator.tickActivity()
      expect(proactiveEvents).toHaveLength(1) // Still 1, second blocked by DND

      orchestrator.stop()
    })

    it('tracks ignore count and exposes DND state', () => {
      const screenshotProvider = new SequentialScreenshotProvider([pngA])
      const vlmProvider = new StubVlmProvider()

      const orchestrator = createAnimaOrchestrator(
        { screenshotProvider, vlmProvider },
      )

      expect(orchestrator.getDndState().consecutiveIgnores).toBe(0)

      orchestrator.recordIgnore()
      orchestrator.recordIgnore()
      expect(orchestrator.getDndState().consecutiveIgnores).toBe(2)

      orchestrator.recordUserInteraction()
      expect(orchestrator.getDndState().consecutiveIgnores).toBe(0)

      orchestrator.stop()
    })
  })
})
