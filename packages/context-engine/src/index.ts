export { buildActivityContext } from './activity/activity-context'

export { calculateContinuousWorkDuration } from './activity/duration'

export { ScreenshotCapture } from './capture/screenshot'
export { DocumentStore } from './storage/document-store'
export type {
  ContextVector,
  Conversation,
  ConversationRole,
  Todo,
  VectorSearchResult,
  VectorSource,
} from './storage/types'
export { VectorStore } from './storage/vector-store'
export type {
  ActivityContext,
  ActivityEvent,
  ScreenshotProvider,
  ScreenshotResult,
} from './types'
