import type { EmotionPayload } from '../../constants/emotions'

import { defineStore } from 'pinia'
import { ref } from 'vue'

import { Emotion } from '../../constants/emotions'
import { useModsServerChannelStore } from '../mods/api/channel-server'

export interface PersonaState {
  emotion: string
  intensity: number
  triggeredBy?: string
}

export interface IntimacyState {
  level: number
  label: string
  delta?: number
}

export interface ProactiveTrigger {
  id: string
  kind: 'greeting' | 'reminder' | 'observation' | 'care'
  headline: string
  note?: string
  emotion?: string
}

const PERSONA_TO_ANIMA_EMOTION: Record<string, Emotion> = {
  idle: Emotion.Neutral,
  curious: Emotion.Curious,
  caring: Emotion.Happy,
  worried: Emotion.Sad,
  sleepy: Emotion.Neutral,
  excited: Emotion.Surprise,
}

export const usePersonaModuleStore = defineStore('persona-module', () => {
  const currentEmotion = ref<PersonaState>({ emotion: 'idle', intensity: 0.3 })
  const intimacy = ref<IntimacyState>({ level: 50, label: 'friendly' })
  const lastProactiveTrigger = ref<ProactiveTrigger | null>(null)
  const disposers = ref<Array<() => void>>([])

  /**
   * Maps a persona emotion name to the Anima emotion system.
   */
  function mapToAnimaEmotion(emotion: string, intensity: number): EmotionPayload {
    const name = PERSONA_TO_ANIMA_EMOTION[emotion] ?? Emotion.Neutral
    return { name, intensity }
  }

  /**
   * Initialize WebSocket subscriptions. Call after serverChannelStore is connected.
   * Accepts an optional callback to enqueue emotions into the animation system.
   */
  function initialize(onEmotionChange?: (payload: EmotionPayload) => void): void {
    const serverChannel = useModsServerChannelStore()

    disposers.value.push(
      serverChannel.onEvent('persona:emotion:state', (event) => {
        const { emotion, intensity, triggeredBy } = event.data
        currentEmotion.value = { emotion, intensity, triggeredBy }

        if (onEmotionChange) {
          onEmotionChange(mapToAnimaEmotion(emotion, intensity))
        }
      }),
    )

    disposers.value.push(
      serverChannel.onEvent('persona:intimacy:state', (event) => {
        intimacy.value = { ...event.data }
      }),
    )

    disposers.value.push(
      serverChannel.onEvent('persona:proactive:trigger', (event) => {
        lastProactiveTrigger.value = { ...event.data }
      }),
    )
  }

  function dispose(): void {
    for (const d of disposers.value) {
      d()
    }
    disposers.value = []
  }

  function resetState(): void {
    currentEmotion.value = { emotion: 'idle', intensity: 0.3 }
    intimacy.value = { level: 50, label: 'friendly' }
    lastProactiveTrigger.value = null
  }

  return {
    currentEmotion,
    intimacy,
    lastProactiveTrigger,
    mapToAnimaEmotion,
    initialize,
    dispose,
    resetState,
  }
})
