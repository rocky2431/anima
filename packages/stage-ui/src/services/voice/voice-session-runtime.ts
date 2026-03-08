import type { ActorRefFrom } from 'xstate'

import type { ChatTurnHandle } from '../../stores/chat'
import type { VoiceSessionContext, VoiceSessionEvent, VoiceUIState } from './voice-session-machine'

import { createActor } from 'xstate'

import { deriveUIState, voiceSessionMachine } from './voice-session-machine'

export interface VoiceSessionDeps {
  /** Start an LLM turn and get an abortable handle */
  startChatTurn: (text: string) => ChatTurnHandle
  /** Open a speech intent for TTS playback */
  openSpeechIntent: (options?: { behavior?: 'queue' | 'interrupt' | 'replace' }) => {
    intentId: string
    writeLiteral: (text: string) => void
    end: () => void
    cancel: (reason?: string) => void
  }
  /** Interrupt all current speech playback */
  interruptSpeech: (reason: string) => void
  /** Dynamically adjust VAD threshold for echo suppression */
  setVADThreshold?: (threshold: number) => void
  /** Called when UI state changes */
  onUIStateChange?: (state: VoiceUIState) => void
  /** Called when user text is committed (for transcript display) */
  onUserCommit?: (text: string) => void
  /** Called when assistant produces text (for transcript display) */
  onAssistantToken?: (text: string) => void
}

/** VAD threshold when AI is not speaking (normal sensitivity) */
const VAD_THRESHOLD_NORMAL = 0.3
/** VAD threshold when AI is speaking (reduced sensitivity to avoid echo) */
const VAD_THRESHOLD_SPEAKING = 0.7

export interface VoiceSessionRuntime {
  /** Send events to the state machine */
  send: (event: VoiceSessionEvent) => void
  /** Get current UI state */
  getUIState: () => VoiceUIState
  /** Get current machine context */
  getContext: () => VoiceSessionContext
  /** Get the raw xstate actor for snapshot subscriptions */
  actor: ActorRefFrom<typeof voiceSessionMachine>
  /** Start the session */
  start: () => void
  /** Stop and clean up */
  dispose: () => void
}

export function createVoiceSessionRuntime(deps: VoiceSessionDeps): VoiceSessionRuntime {
  const actor = createActor(voiceSessionMachine)

  let currentTurnHandle: ChatTurnHandle | null = null
  let currentSpeechIntent: ReturnType<VoiceSessionDeps['openSpeechIntent']> | null = null
  let previousUIState: VoiceUIState = 'idle'

  // Subscribe to state transitions for side effects
  actor.subscribe((snapshot) => {
    const uiState = deriveUIState(snapshot.value)

    if (uiState !== previousUIState) {
      const prevState = previousUIState
      previousUIState = uiState
      deps.onUIStateChange?.(uiState)

      // Dynamic VAD threshold: raise when AI is speaking to suppress echo
      if (uiState === 'speaking') {
        deps.setVADThreshold?.(VAD_THRESHOLD_SPEAKING)
      }
      else if (prevState === 'speaking' || prevState === 'interrupted') {
        deps.setVADThreshold?.(VAD_THRESHOLD_NORMAL)
      }
    }
  })

  // Wire up event-driven side effects by intercepting send
  const originalSend = actor.send.bind(actor)

  function send(event: VoiceSessionEvent) {
    // Pre-send side effects
    switch (event.type) {
      case 'BARGE_IN': {
        // Cancel current LLM turn
        if (currentTurnHandle) {
          currentTurnHandle.abort('barge-in')
          currentTurnHandle = null
        }
        // Cancel current speech
        if (currentSpeechIntent) {
          currentSpeechIntent.cancel('barge-in')
          currentSpeechIntent = null
        }
        deps.interruptSpeech('barge-in')
        break
      }
      case 'TURN_COMMIT': {
        const ctx = actor.getSnapshot().context
        const text = ctx.userCommittedText || ctx.userPartial
        if (text.trim()) {
          deps.onUserCommit?.(text)

          // Start LLM turn
          currentTurnHandle = deps.startChatTurn(text)

          // Open speech intent for TTS
          currentSpeechIntent = deps.openSpeechIntent({ behavior: 'replace' })

          // Send LLM_START after commit
          originalSend(event)
          originalSend({ type: 'LLM_START', turnId: currentTurnHandle.id })
          return
        }
        break
      }
      case 'LLM_TOKEN': {
        deps.onAssistantToken?.(event.text)

        // Feed token to speech intent for TTS
        if (currentSpeechIntent) {
          currentSpeechIntent.writeLiteral(event.text)
        }
        break
      }
      case 'LLM_DONE': {
        // Close speech intent stream
        if (currentSpeechIntent) {
          currentSpeechIntent.end()
        }
        currentTurnHandle = null
        break
      }
      case 'PLAYBACK_END': {
        currentSpeechIntent = null
        break
      }
    }

    originalSend(event)
  }

  return {
    send,
    getUIState: () => deriveUIState(actor.getSnapshot().value),
    getContext: () => actor.getSnapshot().context,
    actor,
    start: () => actor.start(),
    dispose: () => {
      // Clean up any in-flight operations
      if (currentTurnHandle) {
        currentTurnHandle.abort('dispose')
        currentTurnHandle = null
      }
      if (currentSpeechIntent) {
        currentSpeechIntent.cancel('dispose')
        currentSpeechIntent = null
      }
      actor.stop()
    },
  }
}
