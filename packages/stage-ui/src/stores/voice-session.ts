import type { VoiceUIState } from '../services/voice/voice-session-machine'
import type { VoiceSessionRuntime } from '../services/voice/voice-session-runtime'
import type { ChatProvider } from './providers/types'

import { defineStore, storeToRefs } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

import { createVoiceSessionRuntime } from '../services/voice/voice-session-runtime'
import { useChatOrchestratorStore } from './chat'
import { useConsciousnessStore } from './modules/consciousness'
import { useProvidersStore } from './providers'
import { useSpeechRuntimeStore } from './speech-runtime'

export const useVoiceSessionStore = defineStore('voice-session', () => {
  const chatStore = useChatOrchestratorStore()
  const speechRuntime = useSpeechRuntimeStore()
  const providersStore = useProvidersStore()
  const consciousnessStore = useConsciousnessStore()
  const { activeProvider, activeModel } = storeToRefs(consciousnessStore)

  const runtime = shallowRef<VoiceSessionRuntime | null>(null)
  const uiState = ref<VoiceUIState>('idle')
  const userPartial = ref('')
  const assistantPartial = ref('')
  const mode = ref<'hands_free' | 'push_to_talk'>('hands_free')
  const active = computed(() => uiState.value !== 'idle')

  async function start() {
    if (runtime.value) {
      return
    }

    // Pre-resolve the provider so it's available synchronously in startChatTurn
    const chatProviderInstance = await providersStore.getProviderInstance(activeProvider.value) as ChatProvider

    const session = createVoiceSessionRuntime({
      startChatTurn(text: string) {
        const providerConfig = providersStore.getProviderConfig(activeProvider.value)

        return chatStore.startTurn(text, {
          model: activeModel.value,
          chatProvider: chatProviderInstance,
          providerConfig,
        })
      },

      openSpeechIntent(options) {
        return speechRuntime.openIntent({
          behavior: options?.behavior ?? 'replace',
        })
      },

      interruptSpeech(reason: string) {
        // The speech pipeline's interrupt is accessed via the intent handle
        // For now, we use the openIntent with replace behavior which cancels previous
        console.info('[VoiceSession] Interrupt speech:', reason)
      },

      onUIStateChange(state: VoiceUIState) {
        uiState.value = state
      },

      onUserCommit(text: string) {
        console.info('[VoiceSession] User committed:', text)
      },

      onAssistantToken(text: string) {
        assistantPartial.value += text
      },
    })

    runtime.value = session
    session.start()
    session.send({ type: 'MIC_ENABLE' })
  }

  function stop() {
    if (!runtime.value)
      return

    runtime.value.dispose()
    runtime.value = null
    uiState.value = 'idle'
    userPartial.value = ''
    assistantPartial.value = ''
  }

  function send(event: Parameters<VoiceSessionRuntime['send']>[0]) {
    runtime.value?.send(event)

    // Sync reactive state from machine context
    if (runtime.value) {
      const ctx = runtime.value.getContext()
      userPartial.value = ctx.userPartial
    }
  }

  function toggleMode() {
    const newMode = mode.value === 'hands_free' ? 'push_to_talk' : 'hands_free'
    mode.value = newMode
    runtime.value?.send({ type: 'SET_MODE', mode: newMode })
  }

  function bargeIn() {
    runtime.value?.send({ type: 'BARGE_IN' })
    assistantPartial.value = ''
  }

  return {
    // State
    uiState,
    userPartial,
    assistantPartial,
    mode,
    active,

    // Actions
    start,
    stop,
    send,
    toggleMode,
    bargeIn,
  }
})
