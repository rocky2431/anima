import { assign, setup } from 'xstate'

// ---------------------------------------------------------------------------
// Voice Session State Machine
//
// Dual parallel-region design:
//   capture:   muted → listening → userSpeaking → committingTurn
//   assistant:  silent → thinking → speaking → interrupted
//
// UI state is derived from the combination of both regions.
// ---------------------------------------------------------------------------

export interface VoiceSessionContext {
  sessionId: string
  mode: 'hands_free' | 'push_to_talk'
  userPartial: string
  userCommittedText: string
  assistantPartial: string
  currentTurnId: string | null
  currentSpeechIntentId: string | null
  isAssistantAudible: boolean
  lastSpeechStartAt: number | null
}

export type VoiceSessionEvent
  = | { type: 'MIC_ENABLE' }
    | { type: 'MIC_DISABLE' }
    | { type: 'PTT_DOWN' }
    | { type: 'PTT_UP' }
    | { type: 'VAD_SPEECH_START' }
    | { type: 'VAD_SPEECH_END' }
    | { type: 'STT_PARTIAL', text: string }
    | { type: 'STT_FINAL', text: string }
    | { type: 'TURN_COMMIT' }
    | { type: 'LLM_START', turnId: string }
    | { type: 'LLM_TOKEN', text: string }
    | { type: 'LLM_DONE' }
    | { type: 'TTS_SEGMENT_READY' }
    | { type: 'PLAYBACK_START', intentId: string }
    | { type: 'PLAYBACK_END' }
    | { type: 'BARGE_IN' }
    | { type: 'INTERRUPT_COMPLETE' }
    | { type: 'ERROR', error: unknown }
    | { type: 'RESET' }
    | { type: 'SET_MODE', mode: 'hands_free' | 'push_to_talk' }

export const voiceSessionMachine = setup({
  types: {
    context: {} as VoiceSessionContext,
    events: {} as VoiceSessionEvent,
  },
  actions: {
    clearUserPartial: assign({ userPartial: '' }),
    clearAssistantPartial: assign({ assistantPartial: '' }),
    clearTurn: assign({
      currentTurnId: null,
      currentSpeechIntentId: null,
    }),
    appendUserPartial: assign({
      userPartial: ({ context, event }) => {
        if (event.type === 'STT_PARTIAL')
          return event.text
        return context.userPartial
      },
    }),
    commitUserText: assign({
      userCommittedText: ({ context, event }) => {
        if (event.type === 'STT_FINAL')
          return event.text
        // Commit whatever partial we have
        return context.userPartial || context.userCommittedText
      },
      userPartial: '',
    }),
    appendAssistantPartial: assign({
      assistantPartial: ({ context, event }) => {
        if (event.type === 'LLM_TOKEN')
          return context.assistantPartial + event.text
        return context.assistantPartial
      },
    }),
    setTurnId: assign({
      currentTurnId: ({ event }) => {
        if (event.type === 'LLM_START')
          return event.turnId
        return null
      },
    }),
    setSpeechIntentId: assign({
      currentSpeechIntentId: ({ event }) => {
        if (event.type === 'PLAYBACK_START')
          return event.intentId
        return null
      },
    }),
    markAudible: assign({ isAssistantAudible: true }),
    markSilent: assign({ isAssistantAudible: false }),
    recordSpeechStart: assign({ lastSpeechStartAt: () => Date.now() }),
    setMode: assign({
      mode: ({ event }) => {
        if (event.type === 'SET_MODE')
          return event.mode
        return 'hands_free'
      },
    }),
    resetContext: assign({
      userPartial: '',
      userCommittedText: '',
      assistantPartial: '',
      currentTurnId: null,
      currentSpeechIntentId: null,
      isAssistantAudible: false,
      lastSpeechStartAt: null,
    }),
  },
  guards: {
    isHandsFree: ({ context }) => context.mode === 'hands_free',
    isPushToTalk: ({ context }) => context.mode === 'push_to_talk',
    hasUserText: ({ context }) => !!(context.userPartial.trim() || context.userCommittedText.trim()),
  },
}).createMachine({
  id: 'voiceSession',
  initial: 'idle',
  context: {
    sessionId: '',
    mode: 'hands_free',
    userPartial: '',
    userCommittedText: '',
    assistantPartial: '',
    currentTurnId: null,
    currentSpeechIntentId: null,
    isAssistantAudible: false,
    lastSpeechStartAt: null,
  },
  on: {
    SET_MODE: { actions: 'setMode' },
    RESET: { target: '.idle', actions: 'resetContext' },
  },
  states: {
    idle: {
      on: {
        MIC_ENABLE: { target: 'ready' },
      },
    },

    ready: {
      type: 'parallel',
      on: {
        MIC_DISABLE: { target: 'idle', actions: 'resetContext' },
        ERROR: { target: 'idle', actions: 'resetContext' },
      },
      states: {
        // ---------------------------------------------------------------
        // Capture region: tracks user microphone / speech state
        // ---------------------------------------------------------------
        capture: {
          initial: 'listening',
          states: {
            listening: {
              entry: 'clearUserPartial',
              on: {
                VAD_SPEECH_START: {
                  target: 'userSpeaking',
                  actions: 'recordSpeechStart',
                },
                PTT_DOWN: {
                  target: 'userSpeaking',
                  actions: 'recordSpeechStart',
                },
              },
            },
            userSpeaking: {
              on: {
                STT_PARTIAL: { actions: 'appendUserPartial' },
                STT_FINAL: {
                  target: 'committingTurn',
                  actions: 'commitUserText',
                },
                VAD_SPEECH_END: {
                  target: 'committingTurn',
                  actions: 'commitUserText',
                },
                PTT_UP: {
                  target: 'committingTurn',
                  actions: 'commitUserText',
                },
              },
            },
            committingTurn: {
              entry: 'clearUserPartial',
              always: [
                {
                  guard: 'hasUserText',
                  actions: { type: 'clearUserPartial' },
                },
              ],
              on: {
                TURN_COMMIT: { target: 'listening' },
                // If user starts talking again before commit, go back
                VAD_SPEECH_START: {
                  target: 'userSpeaking',
                  actions: 'recordSpeechStart',
                },
              },
            },
          },
        },

        // ---------------------------------------------------------------
        // Assistant region: tracks AI response state
        // ---------------------------------------------------------------
        assistant: {
          initial: 'silent',
          states: {
            silent: {
              entry: ['clearAssistantPartial', 'markSilent'],
              on: {
                LLM_START: {
                  target: 'thinking',
                  actions: 'setTurnId',
                },
              },
            },
            thinking: {
              entry: 'clearAssistantPartial',
              on: {
                LLM_TOKEN: { actions: 'appendAssistantPartial' },
                PLAYBACK_START: {
                  target: 'speaking',
                  actions: ['setSpeechIntentId', 'markAudible'],
                },
                LLM_DONE: { target: 'silent' },
                BARGE_IN: {
                  target: 'interrupted',
                  actions: 'clearTurn',
                },
              },
            },
            speaking: {
              entry: 'markAudible',
              on: {
                LLM_TOKEN: { actions: 'appendAssistantPartial' },
                PLAYBACK_END: {
                  target: 'silent',
                  actions: 'clearTurn',
                },
                BARGE_IN: {
                  target: 'interrupted',
                  actions: 'clearTurn',
                },
              },
            },
            interrupted: {
              entry: ['markSilent', 'clearAssistantPartial'],
              on: {
                INTERRUPT_COMPLETE: { target: 'silent' },
              },
            },
          },
        },
      },
    },
  },
})

// ---------------------------------------------------------------------------
// Derived UI state helpers
// ---------------------------------------------------------------------------

export type VoiceUIState = 'idle' | 'listening' | 'user-speaking' | 'thinking' | 'speaking' | 'interrupted'

/**
 * Derive a simple UI display state from the machine snapshot's `value`.
 * The snapshot value for a parallel machine looks like:
 *   `{ ready: { capture: 'listening', assistant: 'silent' } }` or `'idle'`
 */
export function deriveUIState(snapshotValue: unknown): VoiceUIState {
  if (snapshotValue === 'idle')
    return 'idle'

  if (typeof snapshotValue === 'object' && snapshotValue !== null) {
    const ready = (snapshotValue as Record<string, unknown>).ready as Record<string, string> | undefined
    if (!ready)
      return 'idle'

    const assistant = ready.assistant
    const capture = ready.capture

    if (assistant === 'interrupted')
      return 'interrupted'
    if (assistant === 'speaking')
      return 'speaking'
    if (assistant === 'thinking')
      return 'thinking'
    if (capture === 'userSpeaking')
      return 'user-speaking'

    return 'listening'
  }

  return 'idle'
}
