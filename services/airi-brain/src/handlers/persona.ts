import type { Client } from '@proj-airi/server-sdk'

import { useLogg } from '@guiiai/logg'
import { nanoid } from 'nanoid'

type PersonaEmotion = 'idle' | 'curious' | 'caring' | 'worried' | 'sleepy' | 'excited'

const log = useLogg('brain:persona').useGlobalConfig()

const EMOTION_INTENSITY: Record<PersonaEmotion, number> = {
  idle: 0.3,
  curious: 0.7,
  caring: 0.6,
  worried: 0.5,
  sleepy: 0.2,
  excited: 0.8,
}

let currentEmotion: PersonaEmotion = 'idle'
const intimacyLevel = 50
let emotionTimer: ReturnType<typeof setInterval> | null = null

/**
 * Persona handler — manages emotion state machine and proactive triggers.
 * In production this is backed by persona-engine's emotionMachine + evaluateTriggers.
 * Walking skeleton simulates periodic emotion transitions.
 */
export function registerPersonaHandler(client: Client): void {
  // Push initial state
  setTimeout(() => {
    pushEmotionState(client)
    pushIntimacyState(client)
  }, 1500)

  // Simulate emotion transitions every 30 seconds
  emotionTimer = setInterval(() => {
    const emotions: PersonaEmotion[] = ['idle', 'curious', 'caring', 'excited', 'sleepy']
    const next = emotions[Math.floor(Math.random() * emotions.length)]
    if (next !== currentEmotion) {
      currentEmotion = next
      pushEmotionState(client)
      log.info('Emotion transitioned', { emotion: currentEmotion })
    }
  }, 30_000)

  // Simulate a proactive trigger after 10 seconds
  setTimeout(() => {
    client.send({
      type: 'persona:proactive:trigger',
      data: {
        id: nanoid(),
        kind: 'greeting',
        headline: 'Hey! How are you doing today?',
        note: 'I noticed you just connected. Let me know if you need anything!',
        emotion: 'caring',
      },
    })
    log.info('Sent proactive greeting')
  }, 10_000)
}

function pushEmotionState(client: Client): void {
  client.send({
    type: 'persona:emotion:state',
    data: {
      emotion: currentEmotion,
      intensity: EMOTION_INTENSITY[currentEmotion],
    },
  })
}

function pushIntimacyState(client: Client): void {
  client.send({
    type: 'persona:intimacy:state',
    data: {
      level: intimacyLevel,
      label: intimacyLevel >= 80 ? 'close' : intimacyLevel >= 50 ? 'friendly' : 'acquaintance',
    },
  })
}

export function disposePersonaHandler(): void {
  if (emotionTimer) {
    clearInterval(emotionTimer)
    emotionTimer = null
  }
}
