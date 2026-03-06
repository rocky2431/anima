import type {
  ActivityEvent,
  ProcessedContext,
  ProcessedScreenshotContext,
  ScreenshotProvider,
  VlmProvider,
} from '@anase/context-engine'
import type {
  AnimaEmotionPayload,
  AppCategory,
  DoNotDisturbConfig,
  DoNotDisturbState,
  EmotionEvent,
  IntimacyInteraction,
  IntimacyState,
  PersonaEmotion,
  ProactiveResponse,
  TriggerCondition,
  TriggerInput,
} from '@anase/persona-engine'

import { useLogg } from '@guiiai/logg'
import { ActivityMonitor, ScreenshotPipeline } from '@anase/context-engine'
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
} from '@anase/persona-engine'

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

/**
 * Optional external data source for enriching trigger input with real data.
 * When not provided, safe default values are used.
 */
export interface TriggerDataSource {
  /** Get important dates matching today's month-day (MM-DD format) */
  getImportantDatesForToday?: (monthDay: string) => Array<{ date: string }>
  /** Get incomplete todos */
  getIncompleteTodos?: () => Array<{ title: string, completed: boolean }>
}

/**
 * Optional persistence interface for state recovery across restarts.
 * Uses a key-value string store (e.g., DocumentStore.getSetting/setSetting).
 */
export interface StatePersistence {
  getSetting: (key: string) => string | null
  setSetting: (key: string, value: string) => void
  getIntimacy: () => number
  updateIntimacy: (delta: number) => number
}

export interface AnimaOrchestratorDeps {
  screenshotProvider: ScreenshotProvider
  vlmProvider: VlmProvider
  /** Optional external data source for trigger enrichment */
  triggerDataSource?: TriggerDataSource
  /** Optional state persistence for recovery across restarts */
  persistence?: StatePersistence
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

const COOLDOWNS_KEY = 'anima:trigger_cooldowns'

function restoreTriggerCooldowns(persistence?: StatePersistence): Record<string, number> {
  if (!persistence)
    return {}
  const raw = persistence.getSetting(COOLDOWNS_KEY)
  if (!raw)
    return {}
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as Record<string, number>
    }
  }
  catch { /* ignore malformed data */ }
  return {}
}

function persistTriggerCooldowns(persistence: StatePersistence | undefined, times: Record<string, number>): void {
  persistence?.setSetting(COOLDOWNS_KEY, JSON.stringify(times))
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
 * State lifecycle: intimacy and trigger cooldowns are persisted to SQLite via
 * the optional StatePersistence interface. Emotion state is ephemeral by design
 * (resets to 'idle' on restart). DND state is ephemeral.
 */
export function createAnimaOrchestrator(
  deps: AnimaOrchestratorDeps,
  config: AnimaOrchestratorConfig = {},
): AnimaOrchestrator {
  const log = useLogg('anima-orchestrator').useGlobalConfig()
  const errorHandler = config.onError ?? ((err: Error) => {
    log.withError(err).error('Unhandled orchestrator error')
  })

  const persistence = deps.persistence

  // Restore persisted state or use defaults
  const restoredIntimacyScore = persistence?.getIntimacy() ?? config.initialIntimacyScore ?? 0
  const restoredCooldowns = restoreTriggerCooldowns(persistence)

  const emotionActor = createEmotionActor()
  let intimacy = createIntimacyState(restoredIntimacyScore)
  let dndState = createDoNotDisturbState()
  const dndConfig = config.dndConfig ?? createDefaultConfig()
  const lastTriggerTimes: Record<string, number> = { ...restoredCooldowns }
  const triggers = [...(config.triggers ?? ALL_TRIGGERS)]

  // Internal tracking state for trigger enrichment
  let firstActivityTimeToday: number | null = null
  let todayDate = new Date().toDateString()
  const windowSwitchTimestamps: number[] = []
  let previousApp = ''
  let previousFocusStartTime = 0

  function getCurrentEmotion(): PersonaEmotion {
    return emotionActor.getSnapshot().value as PersonaEmotion
  }

  function handleProcessedContext(context: ProcessedContext): void {
    try {
      const now = Date.now()

      // Reset tracking on new day
      const currentDay = new Date(now).toDateString()
      if (currentDay !== todayDate) {
        todayDate = currentDay
        firstActivityTimeToday = null
        windowSwitchTimestamps.length = 0
      }

      // Track first activity of today
      if (context.activity.isActive && firstActivityTimeToday === null) {
        firstActivityTimeToday = now
      }

      // Track window switches
      const currentApp = context.activity.currentApp
      if (currentApp && currentApp !== previousApp) {
        if (previousApp) {
          windowSwitchTimestamps.push(now)
        }
        // Track previous focus duration
        if (previousFocusStartTime > 0) {
          // previousFocusDurationMs is available via closure
        }
        previousFocusStartTime = now
        previousApp = currentApp
      }

      // Prune old window switch timestamps (keep last 10 minutes)
      const tenMinAgo = now - 10 * 60_000
      while (windowSwitchTimestamps.length > 0 && windowSwitchTimestamps[0] < tenMinAgo) {
        windowSwitchTimestamps.shift()
      }

      const previousFocusDurationMs = previousFocusStartTime > 0 ? now - previousFocusStartTime : 0

      const triggerInput = buildTriggerInput(
        context,
        intimacy,
        now,
        { firstActivityTimeToday, windowSwitchTimestamps, previousFocusDurationMs },
        deps.triggerDataSource,
      )

      const currentHour = new Date(now).getHours()
      if (!canTrigger(dndState, currentHour, context.activity.isFullscreen, 'normal', now, dndConfig)) {
        return
      }

      const result = evaluateTriggers(triggerInput, triggers, lastTriggerTimes, now)

      if (!result.triggered) {
        return
      }

      lastTriggerTimes[result.triggerId] = now
      persistTriggerCooldowns(persistence, lastTriggerTimes)
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
      const oldScore = intimacy.score
      intimacy = applyScoreChange(intimacy, interaction)
      const delta = intimacy.score - oldScore
      if (delta !== 0 && persistence) {
        persistence.updateIntimacy(delta)
      }
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
 * Well-known entertainment apps for app category classification.
 */
const ENTERTAINMENT_APPS = new Set([
  'spotify',
  'music',
  'vlc',
  'netflix',
  'youtube',
  'twitch',
  'discord',
  'steam',
  'epic games',
  'battle.net',
])

function classifyApp(appName: string): AppCategory {
  const lower = appName.toLowerCase()
  if (ENTERTAINMENT_APPS.has(lower))
    return 'entertainment'
  if (['code', 'terminal', 'iterm', 'xcode', 'intellij', 'webstorm', 'chrome', 'firefox', 'safari', 'slack', 'notion', 'figma', 'linear'].some(w => lower.includes(w)))
    return 'work'
  return 'other'
}

/**
 * Build a TriggerInput from a ProcessedContext, enriched with real tracked data.
 * Uses internal state tracking for window switches, focus duration, and first activity.
 * Uses optional TriggerDataSource for external data (todos, important dates).
 */
function buildTriggerInput(
  context: ProcessedContext,
  intimacy: IntimacyState,
  now: number,
  tracking: {
    firstActivityTimeToday: number | null
    windowSwitchTimestamps: number[]
    previousFocusDurationMs: number
  },
  dataSource?: TriggerDataSource,
): TriggerInput {
  const date = new Date(now)
  const fiveMinAgo = now - 5 * 60_000

  // Window switches in last 5 minutes
  const windowSwitchesInLast5Min = tracking.windowSwitchTimestamps.filter(t => t >= fiveMinAgo).length

  // Check important dates from external source
  const monthDay = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const matchedImportantDate = !!dataSource?.getImportantDatesForToday?.(monthDay)?.length

  // Check near-deadline todos from external source
  const hasNearDeadlineTodos = !!dataSource?.getIncompleteTodos?.()?.length

  // Classify previous app
  const recentApps = context.activity.recentApps
  const previousAppCategory: AppCategory = recentApps.length > 1
    ? classifyApp(recentApps[1])
    : 'work'

  return {
    continuousWorkDurationMs: context.activity.continuousWorkDurationMs,
    isFullscreen: context.activity.isFullscreen,
    currentApp: context.activity.currentApp,
    currentHour: date.getHours(),
    currentMinute: date.getMinutes(),
    isFirstActivityToday: tracking.firstActivityTimeToday !== null
      && (now - tracking.firstActivityTimeToday) < 60_000,
    previousAppCategory,
    hasActivityData: context.activity.recentApps.length > 0,
    matchedImportantDate,
    hasNearDeadlineTodos,
    windowSwitchesInLast5Min,
    previousFocusDurationMs: tracking.previousFocusDurationMs,
    timeSinceLastActivityMs: context.activity.lastActivityTimestamp > 0
      ? now - context.activity.lastActivityTimestamp
      : 0,
    intimacyStage: intimacy.stage,
  }
}
