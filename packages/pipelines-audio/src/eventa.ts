import type {
  PlaybackEndEvent,
  PlaybackInterruptEvent,
  PlaybackRejectEvent,
  PlaybackStartEvent,
  TextSegment,
  TtsRequest,
  TtsResult,
} from './types'

import { defineEventa } from '@moeru/eventa'

export const speechSegmentEvent = defineEventa<TextSegment>('anase:pipelines:output:speech:segment')
export const speechSpecialEvent = defineEventa<TextSegment>('anase:pipelines:output:speech:special')
export const speechTtsRequestEvent = defineEventa<TtsRequest>('anase:pipelines:output:speech:tts-request')
export const speechTtsResultEvent = defineEventa<TtsResult<any>>('anase:pipelines:output:speech:tts-result')
export const speechPlaybackStartEvent = defineEventa<PlaybackStartEvent<any>>('anase:pipelines:output:speech:playback-start')
export const speechPlaybackEndEvent = defineEventa<PlaybackEndEvent<any>>('anase:pipelines:output:speech:playback-end')
export const speechPlaybackInterruptEvent = defineEventa<PlaybackInterruptEvent<any>>('anase:pipelines:output:speech:playback-interrupt')
export const speechPlaybackRejectEvent = defineEventa<PlaybackRejectEvent<any>>('anase:pipelines:output:speech:playback-reject')
export const speechIntentStartEvent = defineEventa<string>('anase:pipelines:output:speech:intent-start')
export const speechIntentEndEvent = defineEventa<string>('anase:pipelines:output:speech:intent-end')
export const speechIntentCancelEvent = defineEventa<{ intentId: string, reason?: string }>('anase:pipelines:output:speech:intent-cancel')

export const speechPipelineEventMap = {
  onSegment: speechSegmentEvent,
  onSpecial: speechSpecialEvent,
  onTtsRequest: speechTtsRequestEvent,
  onTtsResult: speechTtsResultEvent,
  onPlaybackStart: speechPlaybackStartEvent,
  onPlaybackEnd: speechPlaybackEndEvent,
  onPlaybackInterrupt: speechPlaybackInterruptEvent,
  onPlaybackReject: speechPlaybackRejectEvent,
  onIntentStart: speechIntentStartEvent,
  onIntentEnd: speechIntentEndEvent,
  onIntentCancel: speechIntentCancelEvent,
} as const

export type SpeechPipelineEventName = keyof typeof speechPipelineEventMap
