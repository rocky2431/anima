export { buildActivityContext } from './activity/activity-context'

export { calculateContinuousWorkDuration } from './activity/duration'

export { FolderMonitor } from './capture/folder-monitor'
export { areSimilar, computePHash, DeduplicationTracker, hammingDistance } from './capture/phash'
export type { DeduplicationStats } from './capture/phash'
export { ScreenshotCapture } from './capture/screenshot'

export { ScreenshotPipeline } from './capture/screenshot-pipeline'
export type { ScreenshotPipelineOptions } from './capture/screenshot-pipeline'
export { ActivityMonitor } from './consumption/activity-monitor'
export type { ActivityMonitorOptions } from './consumption/activity-monitor'
export { MemoryOrchestrator } from './consumption/memory-orchestrator'
export type { MemoryOrchestratorOptions } from './consumption/memory-orchestrator'
export { ReportGenerator } from './consumption/report-generator'
export type { ReportGeneratorOptions } from './consumption/report-generator'
export { SmartTip } from './consumption/smart-tip'
export type { SmartTipOptions } from './consumption/smart-tip'
export { cosineSimilarity, SmartTodo } from './consumption/smart-todo'
export type { SmartTodoOptions } from './consumption/smart-todo'
export { computeImportance, ContextMerger, deduplicateStrings, mergeKeywords, selectTopSources } from './processing/context-merger'
export type { ContextMergerOptions } from './processing/context-merger'
export { DocumentProcessor } from './processing/document-processor'
export { EntityExtractor } from './processing/entity-extractor'
export { classifyTask, ModelRouter } from './processing/model-router'
export type { ModelRouterOptions, ModelTier, RoutingStats, TaskType } from './processing/model-router'
export { ScreenshotProcessor } from './processing/screenshot-processor'
export type { ScreenshotUnderstanding } from './processing/screenshot-processor'
export { chunkText } from './processing/text-chunker'
export type {
  ActivityType,
  ContextSource,
  ExtractedEntities,
  MergedContext,
} from './processing/types'
export { DocumentStore } from './storage/document-store'
export { MemoryExtractor } from './storage/memory-extractor'
export type { MemoryExtractorOptions } from './storage/memory-extractor'
export type {
  ContextVector,
  Conversation,
  ConversationRole,
  ImportantDate,
  MemoryEntry,
  Relationship,
  Todo,
  UserProfileFact,
  VectorSearchResult,
  VectorSource,
} from './storage/types'
export { VectorStore } from './storage/vector-store'
export type {
  ActivityBreakdownEntry,
  ActivityContext,
  ActivityEvent,
  ActivityState,
  DailySummary,
  DocumentExtractionResult,
  DocumentProcessorOptions,
  DocumentType,
  EmbeddingProvider,
  ExtractedImportantDate,
  ExtractedMemoryItem,
  ExtractedProfileFact,
  ExtractedRelationship,
  ExtractionInput,
  ExtractionResult,
  FileChangeEvent,
  FolderMonitorOptions,
  LlmProvider,
  MemoryRecallResult,
  PersonaConfig,
  ProcessedContext,
  ProcessedScreenshotContext,
  ScreenshotProvider,
  ScreenshotResult,
  SmartTipResult,
  SmartTodoResult,
  TextChunk,
  TextChunkerOptions,
  TodoSuggestion,
  VlmProvider,
  VlmResult,
} from './types'
