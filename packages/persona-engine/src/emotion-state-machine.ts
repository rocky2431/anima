import type { ActorRefFrom } from 'xstate'

import type { PersonaEmotion } from './types'

import { createActor, createMachine } from 'xstate'

/**
 * Events that drive emotion state transitions.
 */
export type EmotionEvent
  = | { type: 'USER_ACTIVE' }
    | { type: 'USER_SHARES_PERSONAL' }
    | { type: 'TRIGGER_CONCERN' }
    | { type: 'LATE_NIGHT' }
    | { type: 'GOOD_NEWS' }
    | { type: 'CONVERSATION_END' }
    | { type: 'USER_REASSURED' }
    | { type: 'CALM_DOWN' }

/**
 * xstate v5 state machine for persona emotion management.
 *
 * States: idle -> curious -> caring (natural conversation progression)
 * External events (triggers, time) can shift to worried/sleepy/excited.
 * CONVERSATION_END always returns to idle.
 */
export const emotionMachine = createMachine({
  id: 'persona-emotion',
  initial: 'idle' satisfies PersonaEmotion,
  types: {} as { events: EmotionEvent },
  states: {
    idle: {
      on: {
        USER_ACTIVE: 'curious',
        TRIGGER_CONCERN: 'worried',
        LATE_NIGHT: 'sleepy',
        GOOD_NEWS: 'excited',
      },
    },
    curious: {
      on: {
        USER_SHARES_PERSONAL: 'caring',
        TRIGGER_CONCERN: 'worried',
        CONVERSATION_END: 'idle',
        GOOD_NEWS: 'excited',
      },
    },
    caring: {
      on: {
        TRIGGER_CONCERN: 'worried',
        CONVERSATION_END: 'idle',
        GOOD_NEWS: 'excited',
      },
    },
    worried: {
      on: {
        USER_REASSURED: 'caring',
        CONVERSATION_END: 'idle',
        GOOD_NEWS: 'excited',
      },
    },
    sleepy: {
      on: {
        USER_ACTIVE: 'curious',
        GOOD_NEWS: 'excited',
        CONVERSATION_END: 'idle',
      },
    },
    excited: {
      on: {
        CALM_DOWN: 'curious',
        CONVERSATION_END: 'idle',
        TRIGGER_CONCERN: 'worried',
      },
    },
  },
})

/**
 * Type of an xstate actor running the emotion machine.
 */
export type EmotionActor = ActorRefFrom<typeof emotionMachine>

/**
 * Create a started xstate actor for the emotion state machine.
 * Convenience wrapper so consumers don't need to import xstate directly.
 *
 * @returns A started EmotionActor. Call .stop() when done.
 */
export function createEmotionActor(): EmotionActor {
  const actor = createActor(emotionMachine)
  actor.start()
  return actor
}
