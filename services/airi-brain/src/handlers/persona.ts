import type { DocumentStore } from '@proj-airi/context-engine'
import type { EmotionActor, EmotionState, PersonaEmotion } from '@proj-airi/persona-engine'
import type { Client } from '@proj-airi/server-sdk'

import { useLogg } from '@guiiai/logg'
import {
  ALL_TRIGGERS,
  createEmotionActor,
  createIntimacyState,
  evaluateTriggers,
  generateResponse,
  getStageForScore,
} from '@proj-airi/persona-engine'
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

export function registerPersonaHandler(client: Client, store: DocumentStore): void {
  // Create xstate emotion actor
  emotionActor = createEmotionActor()

  // Restore intimacy from DB
  const savedIntimacy = store.getIntimacy()
  const intimacyState = createIntimacyState(savedIntimacy)

  // Subscribe to emotion transitions
  emotionActor.subscribe((snapshot) => {
    const emotion = snapshot.value as PersonaEmotion
    pushEmotionState(client, emotion)
    log.info('Emotion transitioned', { emotion })
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

    const result = evaluateTriggers(
      {
        currentHour,
        currentMinute,
        currentApp: '',
        previousAppCategory: 'work',
        continuousWorkDurationMs: 0,
        isFirstActivityToday: false,
        isFullscreen: false,
        hasActivityData: false,
        matchedImportantDate: false,
        hasNearDeadlineTodos: false,
        windowSwitchesInLast5Min: 0,
        previousFocusDurationMs: 0,
        timeSinceLastActivityMs: 0,
        intimacyStage: stage,
      },
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

      log.info('Proactive trigger fired', { triggerId: result.triggerId, triggerName: result.triggerName })
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
    log.info('Sent initial greeting')
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
