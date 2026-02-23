/**
 * Project-local stream transcription types.
 *
 * These replicate the shapes previously imported from `@xsai/stream-transcription`.
 * Kept in a standalone file to avoid circular imports between hearing.ts and
 * provider implementations (aliyun, web-speech-api) that both produce/consume
 * these types.
 */

export type StreamTranscriptionDeltaType = 'transcript.text.delta' | 'transcript.text.done'

export interface StreamTranscriptionDelta {
  delta: string
  type: StreamTranscriptionDeltaType
}

export interface StreamTranscriptionResult {
  fullStream: ReadableStream<StreamTranscriptionDelta>
  text: Promise<string>
  textStream: ReadableStream<string>
}
