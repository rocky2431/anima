import type {
  DailySummary,
  ExtractionResult,
  MemoryExtractor,
  MemoryOrchestrator,
  ProcessedContext,
  ReportGenerator,
} from '@proj-airi/context-engine'
import type { CronService } from '@proj-airi/cron-service'
import type { EmotionActor, PersonaEmotion, ProactiveResponse } from '@proj-airi/persona-engine'

import { useLogg } from '@guiiai/logg'
import { generateResponse, T06_EVENING_SUMMARY } from '@proj-airi/persona-engine'

/** Dependencies required to construct an EveningPipeline. All services must be initialized before injection. */
export interface EveningPipelineDeps {
  readonly cronService: CronService
  readonly reportGenerator: ReportGenerator
  readonly memoryExtractor: MemoryExtractor
  readonly memoryOrchestrator: MemoryOrchestrator
  readonly emotionActor: EmotionActor
}

/** Events emitted during evening pipeline execution, in order: report-generated, memories-extracted, persona-response. */
export type EveningPipelineEvent
  = { type: 'report-generated', data: DailySummary }
    | { type: 'memories-extracted', data: ExtractionResult }
    | { type: 'persona-response', data: ProactiveResponse }

/** Optional configuration. onError is called only during cron-triggered execution; direct trigger() calls propagate errors to the caller. */
export interface EveningPipelineConfig {
  onEvent?: (event: EveningPipelineEvent) => void
  onError?: (error: Error) => void
}

export interface EveningPipeline {
  /** Record a ProcessedContext to be included in the evening summary */
  recordActivity: (context: ProcessedContext) => void
  /** Manually trigger the evening pipeline (bypasses cron scheduling) */
  trigger: () => Promise<void>
  /** Schedule the pipeline to run on a cron expression (e.g., '0 21 * * *') */
  scheduleDaily: (cronExpression: string) => string
}

const EVENING_HANDLER_NAME = 'evening-summary'

const PERSONA_EMOTIONS = new Set<string>(['idle', 'curious', 'caring', 'worried', 'sleepy', 'excited'])

function safeGetEmotion(actor: EmotionActor): PersonaEmotion {
  const value = actor.getSnapshot().value as string
  return PERSONA_EMOTIONS.has(value) ? (value as PersonaEmotion) : 'idle'
}

function safeEmit(emitEvent: ((event: EveningPipelineEvent) => void) | undefined, event: EveningPipelineEvent, log: ReturnType<typeof useLogg>): void {
  if (!emitEvent)
    return
  try {
    emitEvent(event)
  }
  catch (cause) {
    log.withError(cause).warn('onEvent callback threw')
  }
}

/**
 * Create a fully wired evening pipeline:
 * CronService → collect activities → ReportGenerator → MemoryExtractor →
 * MemoryOrchestrator.persistExtractionResults → generateResponse (persona).
 *
 * Imperative Shell that orchestrates context-engine, cron-service, and persona-engine
 * for the nightly summary + memory extraction flow.
 */
export function createEveningPipeline(
  deps: EveningPipelineDeps,
  config?: EveningPipelineConfig,
): EveningPipeline {
  const collectedActivities: ProcessedContext[] = []
  const log = useLogg('evening-pipeline').useGlobalConfig()
  const emitEvent = config?.onEvent
  const handleError = config?.onError ?? ((err: Error) => {
    log.withError(err).error('Evening pipeline failed')
  })

  async function executeEveningPipeline(): Promise<void> {
    const activityCount = collectedActivities.length
    log.withFields({ activityCount }).log('Starting evening pipeline')

    // Snapshot then clear — each run processes only today's activities
    const todayActivities = [...collectedActivities]
    collectedActivities.length = 0

    // Phase 1: Generate daily report
    let report: DailySummary
    try {
      report = await deps.reportGenerator.generate(todayActivities)
    }
    catch (cause) {
      throw new Error(`Phase 1 (report generation) failed (activities=${activityCount})`, { cause })
    }
    log.withFields({ highlights: report.highlights.length }).log('Report generated')
    safeEmit(emitEvent, { type: 'report-generated', data: report }, log)

    // Phase 2: Build extraction input from working memory + activities
    const workingMemory = deps.memoryOrchestrator.getWorkingMemory()
    const extractionInput = {
      conversations: workingMemory.map(c => ({
        role: c.role,
        content: c.content,
      })),
      activities: todayActivities.map(a => ({
        app: a.activity.currentApp,
        description: a.activity.currentWindowTitle,
        timestamp: a.timestamp,
      })),
      todos: [],
    }

    // Phase 3: Extract memories
    let extracted: ExtractionResult
    try {
      extracted = await deps.memoryExtractor.extract(extractionInput, [])
    }
    catch (cause) {
      throw new Error(`Phase 3 (memory extraction) failed (conversations=${workingMemory.length})`, { cause })
    }
    log.withFields({ memories: extracted.memories.length }).log('Memories extracted')
    safeEmit(emitEvent, { type: 'memories-extracted', data: extracted }, log)

    // Phase 4: Persist extraction results
    try {
      await deps.memoryOrchestrator.persistExtractionResults(extracted)
    }
    catch (cause) {
      throw new Error(`Phase 4 (persistence) failed (memories=${extracted.memories.length})`, { cause })
    }
    log.log('Extraction results persisted')

    // Phase 5: Generate persona-styled evening response
    const currentEmotion = safeGetEmotion(deps.emotionActor)
    const triggerResult = {
      triggered: true as const,
      triggerId: T06_EVENING_SUMMARY.id,
      triggerName: T06_EVENING_SUMMARY.name,
      suggestedEmotion: T06_EVENING_SUMMARY.suggestedEmotion,
    }
    const response = generateResponse(triggerResult, currentEmotion)
    log.withFields({ emotion: currentEmotion, triggerId: triggerResult.triggerId }).log('Persona response generated')
    safeEmit(emitEvent, { type: 'persona-response', data: response }, log)
  }

  deps.cronService.registerHandler(EVENING_HANDLER_NAME, async () => {
    try {
      await executeEveningPipeline()
    }
    catch (cause) {
      handleError(
        new Error(`Evening pipeline cron handler failed (${collectedActivities.length} activities pending)`, { cause }),
      )
    }
  })

  return {
    recordActivity(context: ProcessedContext): void {
      collectedActivities.push(context)
    },

    async trigger(): Promise<void> {
      try {
        await executeEveningPipeline()
      }
      catch (cause) {
        throw new Error('Evening pipeline manual trigger failed', { cause })
      }
    },

    scheduleDaily(cronExpression: string): string {
      return deps.cronService.cron(cronExpression, {
        handler: EVENING_HANDLER_NAME,
        name: 'Evening Summary',
      })
    },
  }
}
