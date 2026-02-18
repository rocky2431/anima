import type {
  ActivityEvent,
  ProcessedContext,
  ProcessedScreenshotContext,
  ScreenshotProvider,
  VlmProvider,
} from '@proj-airi/context-engine'
import type {
  AnimaEmotionPayload,
  DoNotDisturbConfig,
  DoNotDisturbState,
  EmotionEvent,
  IntimacyInteraction,
  IntimacyState,
  PersonaEmotion,
  ProactiveResponse,
  TriggerCondition,
  TriggerInput,
} from '@proj-airi/persona-engine'

import { useLogg } from '@guiiai/logg'
import { ActivityMonitor, ScreenshotPipeline } from '@proj-airi/context-engine'
import {
  ALL_TRIGGERS,
  applyScoreChange,
  canTrigger,
  createDefaultConfig,
  createDoNotDisturbState,
  createEmotionActor,
  createIntimacyState,
  evaluateTriggers,
  generateResponse,
  mapToAnimaEmotion,
  recordIgnore,
  recordTrigger,
  recordUserInteraction,
} from '@proj-airi/persona-engine'

/**
 * Event emitted when the persona engine decides to speak proactively.
 */
export interface AnimaProactiveEvent {
  /** The generated response text and metadata */
  readonly response: ProactiveResponse
  /** Mapped Anima emotion for the UI layer */
  readonly animaEmotion: AnimaEmotionPayload
  /** Timestamp when the event was generated */
  readonly timestamp: number
}

export interface AnimaOrchestratorDeps {
  screenshotProvider: ScreenshotProvider
  vlmProvider: VlmProvider
}

export interface AnimaOrchestratorConfig {
  readonly screenshotIntervalMs?: number
  readonly aggregationIntervalMs?: number
  readonly inactivityThresholdMs?: number
  /** How long to retain activity events in the sliding window (default: 3 hours) */
  readonly eventRetentionMs?: number
  readonly triggers?: readonly TriggerCondition[]
  readonly initialIntimacyScore?: number
  readonly dndConfig?: DoNotDisturbConfig
  readonly onProactiveResponse?: (event: AnimaProactiveEvent) => void
  readonly onError?: (error: Error) => void
}

/**
 * Mapping from trigger names to emotion machine events.
 * Determines which emotion transition occurs when a trigger fires.
 */
const TRIGGER_EMOTION_MAP: Record<string, EmotionEvent> = {
  'morning-greeting': { type: 'GOOD_NEWS' },
  'noon-care': { type: 'TRIGGER_CONCERN' },
  'rest-reminder': { type: 'TRIGGER_CONCERN' },
  'entertainment-switch': { type: 'USER_ACTIVE' },
  'late-night-work': { type: 'LATE_NIGHT' },
  'evening-summary': { type: 'USER_ACTIVE' },
  'important-date': { type: 'GOOD_NEWS' },
  'task-due': { type: 'TRIGGER_CONCERN' },
  'high-frequency-switch': { type: 'TRIGGER_CONCERN' },
  'big-task-complete': { type: 'GOOD_NEWS' },
  'return-to-desktop': { type: 'USER_ACTIVE' },
}

/**
 * Orchestrates the full Anima pipeline:
 * ScreenshotPipeline → ActivityMonitor → TriggerInput → PersonaEngine → ProactiveResponse.
 *
 * Imperative Shell that wires context-engine and persona-engine together.
 */
export interface AnimaOrchestrator {
  /** Start periodic screenshot capture and activity aggregation */
  start: () => void
  /** Stop all periodic processing and clean up */
  stop: () => void
  /** Feed an activity event into the monitor */
  recordActivity: (event: ActivityEvent) => void
  /** Manually trigger one screenshot capture cycle. Returns true if processed. */
  tickScreenshot: () => Promise<boolean>
  /** Manually trigger one activity aggregation cycle. Returns the ProcessedContext. */
  tickActivity: () => ProcessedContext
  /** Get the current persona emotion state */
  getEmotionState: () => PersonaEmotion
  /** Get the mapped Anima emotion for UI */
  getAnimaEmotion: () => AnimaEmotionPayload
  /** Get the current intimacy state */
  getIntimacy: () => IntimacyState
  /** Get the current DoNotDisturb state */
  getDndState: () => DoNotDisturbState
  /** Send an emotion event to the state machine */
  sendEmotionEvent: (event: EmotionEvent) => void
  /** Record an interaction for intimacy tracking */
  recordInteraction: (interaction: IntimacyInteraction) => void
  /** Record that the user ignored a proactive trigger */
  recordIgnore: () => void
  /** Record that the user actively interacted (resets DND backoff) */
  recordUserInteraction: () => void
}

/**
 * Create a fully wired Anima orchestrator.
 *
 * Connects: ScreenshotPipeline → (onContext) → ActivityMonitor → (onContext) →
 * buildTriggerInput → evaluateTriggers → emotion transition → generateResponse →
 * onProactiveResponse callback.
 *
 * State lifecycle: intimacy, lastTriggerTimes, dndState, and emotion are held in-memory.
 * Emotion state is ephemeral by design (resets to 'idle' on restart).
 * Intimacy and trigger cooldowns reset on restart; persistence is deferred to a
 * dedicated storage integration task.
 */
export function createAnimaOrchestrator(
  deps: AnimaOrchestratorDeps,
  config: AnimaOrchestratorConfig = {},
): AnimaOrchestrator {
  const log = useLogg('anima-orchestrator').useGlobalConfig()
  const errorHandler = config.onError ?? ((err: Error) => {
    log.withError(err).error('Unhandled orchestrator error')
  })

  const emotionActor = createEmotionActor()
  let intimacy = createIntimacyState(config.initialIntimacyScore ?? 0)
  let dndState = createDoNotDisturbState()
  const dndConfig = config.dndConfig ?? createDefaultConfig()
  const lastTriggerTimes: Record<string, number> = {}
  const triggers = [...(config.triggers ?? ALL_TRIGGERS)]

  function getCurrentEmotion(): PersonaEmotion {
    return emotionActor.getSnapshot().value as PersonaEmotion
  }

  function handleProcessedContext(context: ProcessedContext): void {
    try {
      const now = Date.now()
      const triggerInput = buildTriggerInput(context, intimacy, now)

      const currentHour = new Date(now).getHours()
      if (!canTrigger(dndState, currentHour, context.activity.isFullscreen, 'normal', now, dndConfig)) {
        return
      }

      const result = evaluateTriggers(triggerInput, triggers, lastTriggerTimes, now)

      if (!result.triggered) {
        return
      }

      lastTriggerTimes[result.triggerId] = now
      dndState = recordTrigger(dndState, now)

      const emotionEvent = TRIGGER_EMOTION_MAP[result.triggerName]
      if (emotionEvent) {
        emotionActor.send(emotionEvent)
      }

      const currentEmotion = getCurrentEmotion()
      const response = generateResponse(result, currentEmotion)
      const animaEmotion = mapToAnimaEmotion(currentEmotion)

      config.onProactiveResponse?.({
        response,
        animaEmotion,
        timestamp: now,
      })
    }
    catch (err) {
      errorHandler(err instanceof Error ? err : new Error(String(err)))
    }
  }

  function handleScreenshotContext(screenshotContext: ProcessedScreenshotContext): void {
    monitor.setScreenshotContext(screenshotContext)
  }

  const pipeline = new ScreenshotPipeline({
    screenshotProvider: deps.screenshotProvider,
    vlmProvider: deps.vlmProvider,
    intervalMs: config.screenshotIntervalMs ?? 60_000,
    onContext: handleScreenshotContext,
    onError: errorHandler,
  })

  const monitor = new ActivityMonitor({
    aggregationIntervalMs: config.aggregationIntervalMs ?? 15 * 60 * 1000,
    inactivityThresholdMs: config.inactivityThresholdMs,
    eventRetentionMs: config.eventRetentionMs ?? 3 * 60 * 60 * 1000,
    onContext: handleProcessedContext,
    onError: errorHandler,
  })

  return {
    start() {
      pipeline.start()
      monitor.start()
    },

    stop() {
      try { pipeline.stop() }
      catch (err) { errorHandler(err instanceof Error ? err : new Error(String(err))) }
      try { monitor.stop() }
      catch (err) { errorHandler(err instanceof Error ? err : new Error(String(err))) }
      try { emotionActor.stop() }
      catch (err) { errorHandler(err instanceof Error ? err : new Error(String(err))) }
    },

    recordActivity(event: ActivityEvent) {
      monitor.recordEvent(event)
    },

    async tickScreenshot(): Promise<boolean> {
      return pipeline.tick()
    },

    tickActivity(): ProcessedContext {
      return monitor.tick()
    },

    getEmotionState(): PersonaEmotion {
      return getCurrentEmotion()
    },

    getAnimaEmotion(): AnimaEmotionPayload {
      return mapToAnimaEmotion(this.getEmotionState())
    },

    getIntimacy(): IntimacyState {
      return intimacy
    },

    getDndState(): DoNotDisturbState {
      return dndState
    },

    sendEmotionEvent(event: EmotionEvent) {
      emotionActor.send(event)
    },

    recordInteraction(interaction: IntimacyInteraction) {
      intimacy = applyScoreChange(intimacy, interaction)
    },

    recordIgnore() {
      dndState = recordIgnore(dndState, dndConfig)
    },

    recordUserInteraction() {
      dndState = recordUserInteraction(dndState)
    },
  }
}

/**
 * Build a TriggerInput from a ProcessedContext.
 * Maps context-engine's ActivityState to persona-engine's TriggerInput.
 *
 * Fields that require external sources (memory, todo system) use safe default values.
 */
function buildTriggerInput(
  context: ProcessedContext,
  intimacy: IntimacyState,
  now: number,
): TriggerInput {
  const date = new Date(now)

  return {
    continuousWorkDurationMs: context.activity.continuousWorkDurationMs,
    isFullscreen: context.activity.isFullscreen,
    currentApp: context.activity.currentApp,
    currentHour: date.getHours(),
    currentMinute: date.getMinutes(),
    isFirstActivityToday: false,
    previousAppCategory: 'work',
    hasActivityData: context.activity.recentApps.length > 0,
    matchedImportantDate: false,
    hasNearDeadlineTodos: false,
    windowSwitchesInLast5Min: 0,
    previousFocusDurationMs: 0,
    timeSinceLastActivityMs: context.activity.lastActivityTimestamp > 0
      ? now - context.activity.lastActivityTimestamp
      : 0,
    intimacyStage: intimacy.stage,
  }
}
