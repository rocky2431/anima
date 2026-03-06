import type { DocumentStore } from '@anase/context-engine'
import type { AppCategory, EmotionActor, EmotionState, IntimacyStage, PersonaEmotion, TriggerInput } from '@anase/persona-engine'
import type { Client } from '@anase/server-sdk'

import type { BrainStore } from '../store'

import { useLogg } from '@guiiai/logg'
import {
  ALL_TRIGGERS,
  createEmotionActor,
  createIntimacyState,
  evaluateTriggers,
  generateResponse,
  getStageForScore,
} from '@anase/persona-engine'
import { nanoid } from 'nanoid'

const log = useLogg('brain:persona').useGlobalConfig()

const EMOTION_INTENSITY: Record<PersonaEmotion, number> = {
  idle: 0.3,
  curious: 0.7,
  caring: 0.6,
  worried: 0.5,
  sleepy: 0.2,
  excited: 0.8,
}

let emotionActor: EmotionActor | null = null
let triggerTimer: ReturnType<typeof setInterval> | null = null
const lastTriggerTimes: Record<string, number> = {}

function pushEmotionState(client: Client, emotion: PersonaEmotion): void {
  client.send({
    type: 'persona:emotion:state',
    data: {
      emotion,
      intensity: EMOTION_INTENSITY[emotion] ?? 0.3,
    },
  })
}

function pushIntimacyState(client: Client, score: number): void {
  const stage = getStageForScore(score)
  const label = stage === 'closeFriend' ? 'close' : stage === 'soulmate' ? 'close' : stage
  client.send({
    type: 'persona:intimacy:state',
    data: { level: score, label },
  })
}

/**
 * Well-known entertainment apps used to classify previousAppCategory.
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
  // Heuristic: common dev/work tools
  if (['code', 'terminal', 'iterm', 'xcode', 'intellij', 'webstorm', 'chrome', 'firefox', 'safari', 'slack', 'notion', 'figma', 'linear'].some(w => lower.includes(w)))
    return 'work'
  return 'other'
}

/**
 * Build a real TriggerInput from persisted activity data.
 */
function buildTriggerInput(
  currentHour: number,
  currentMinute: number,
  intimacyStage: IntimacyStage,
  now: number,
  brainStore: BrainStore,
  documentStore: DocumentStore,
): TriggerInput {
  const today = new Date().toISOString().slice(0, 10)
  const recentEvents = brainStore.getActivityEvents({ limit: 50 })
  const todayEvents = brainStore.getActivityEvents({ date: today, limit: 50 })

  // Current app: most recent event's appName
  const currentApp = recentEvents.length > 0 ? recentEvents[0].appName : ''

  // Previous app category: second-most-recent event (if any)
  const previousAppCategory: AppCategory = recentEvents.length > 1
    ? classifyApp(recentEvents[1].appName)
    : 'work'

  // Continuous work duration: sum of consecutive recent work-classified events
  let continuousWorkDurationMs = 0
  for (const evt of recentEvents) {
    if (classifyApp(evt.appName) !== 'work')
      break
    continuousWorkDurationMs += evt.durationMs > 0 ? evt.durationMs : 10_000
  }

  // Is first activity today: no events recorded for today before this one
  const isFirstActivityToday = todayEvents.length <= 1

  // Window switches in last 5 minutes
  const fiveMinAgo = now - 5 * 60_000
  const windowSwitchesInLast5Min = recentEvents.filter(e => e.timestamp >= fiveMinAgo).length

  // Previous focus duration: duration of the second-most-recent event
  const previousFocusDurationMs = recentEvents.length > 1
    ? (recentEvents[1].durationMs > 0 ? recentEvents[1].durationMs : 0)
    : 0

  // Has activity data
  const hasActivityData = recentEvents.length > 0

  // Time since last activity
  const timeSinceLastActivityMs = recentEvents.length > 0
    ? now - recentEvents[0].timestamp
    : 0

  // Check important dates for today (MM-DD format)
  const monthDay = today.slice(5) // "MM-DD"
  const matchedImportantDate = documentStore.getImportantDatesForToday(monthDay).length > 0

  // Check near-deadline todos: incomplete todos created more than 1 day ago
  // (rough heuristic since Todo has no deadline field -- any incomplete todo is "near")
  const todos = documentStore.getTodos()
  const hasNearDeadlineTodos = todos.some(t => !t.completed)

  return {
    currentHour,
    currentMinute,
    currentApp,
    previousAppCategory,
    continuousWorkDurationMs,
    isFirstActivityToday,
    isFullscreen: false, // Cannot detect from server side; default false
    hasActivityData,
    matchedImportantDate,
    hasNearDeadlineTodos,
    windowSwitchesInLast5Min,
    previousFocusDurationMs,
    timeSinceLastActivityMs,
    intimacyStage,
  }
}

export function registerPersonaHandler(client: Client, store: DocumentStore, brainStore: BrainStore): void {
  // Create xstate emotion actor
  emotionActor = createEmotionActor()

  // Restore intimacy from DB
  const savedIntimacy = store.getIntimacy()
  const intimacyState = createIntimacyState(savedIntimacy)

  // Subscribe to emotion transitions
  emotionActor.subscribe((snapshot) => {
    const emotion = snapshot.value as PersonaEmotion
    pushEmotionState(client, emotion)
    log.log('Emotion transitioned', { emotion })
  })

  // Push initial state after a short delay to let UI subscribe
  setTimeout(() => {
    const currentEmotion = emotionActor!.getSnapshot().value as PersonaEmotion
    pushEmotionState(client, currentEmotion)
    pushIntimacyState(client, intimacyState.score)
  }, 1500)

  // Evaluate proactive triggers periodically (every 60 seconds)
  triggerTimer = setInterval(() => {
    const now = Date.now()
    const currentHour = new Date().getHours()
    const currentMinute = new Date().getMinutes()
    const currentScore = store.getIntimacy()
    const stage = getStageForScore(currentScore)

    // Build real trigger context from persisted activity data
    const triggerInput = buildTriggerInput(
      currentHour,
      currentMinute,
      stage,
      now,
      brainStore,
      store,
    )

    const result = evaluateTriggers(
      triggerInput,
      [...ALL_TRIGGERS],
      lastTriggerTimes,
      now,
    )

    if (result.triggered) {
      lastTriggerTimes[result.triggerId] = now

      const currentEmotion = emotionActor!.getSnapshot().value as EmotionState
      const response = generateResponse(result as Extract<typeof result, { triggered: true }>, currentEmotion)

      client.send({
        type: 'persona:proactive:trigger',
        data: {
          id: nanoid(),
          kind: mapTriggerKind(result.triggerName!),
          headline: response.message,
          emotion: response.emotion,
        },
      })

      log.log('Proactive trigger fired', { triggerId: result.triggerId, triggerName: result.triggerName })
    }
  }, 60_000)

  // Send a greeting trigger on initial connect (after 10s)
  setTimeout(() => {
    const currentEmotion = emotionActor!.getSnapshot().value as EmotionState
    const response = generateResponse(
      { triggered: true, triggerId: 'T01', triggerName: 'morning-greeting', suggestedEmotion: 'excited' },
      currentEmotion,
    )
    client.send({
      type: 'persona:proactive:trigger',
      data: {
        id: nanoid(),
        kind: 'greeting',
        headline: response.message,
        emotion: response.emotion,
      },
    })
    log.log('Sent initial greeting')
  }, 10_000)
}

function mapTriggerKind(triggerName: string): 'greeting' | 'reminder' | 'observation' | 'care' {
  switch (triggerName) {
    case 'morning-greeting':
    case 'return-to-desktop':
      return 'greeting'
    case 'task-due':
    case 'important-date':
      return 'reminder'
    case 'entertainment-switch':
    case 'high-frequency-switch':
    case 'big-task-complete':
      return 'observation'
    default:
      return 'care'
  }
}

export function disposePersonaHandler(): void {
  if (emotionActor) {
    emotionActor.stop()
    emotionActor = null
  }
  if (triggerTimer) {
    clearInterval(triggerTimer)
    triggerTimer = null
  }
}
