/**
 * Activity types for user context classification.
 * Used by ContextMerger to classify the user's current activity.
 */
export type ActivityType
  = | 'coding'
    | 'writing'
    | 'browsing'
    | 'communication'
    | 'entertainment'
    | 'meeting'
    | 'other'

/**
 * A normalized context source input for merging.
 * Each upstream pipeline (screenshot, activity, document, etc.)
 * converts its output into this unified format before merging.
 */
export interface ContextSource {
  /** Source type identifier */
  readonly source: 'screenshot' | 'activity' | 'document' | 'web' | 'system'
  /** Natural language summary/description from this source */
  readonly summary: string
  /** Entities detected from this source */
  readonly entities: readonly string[]
  /** Keywords extracted from this source */
  readonly keywords: readonly string[]
  /** Source timestamp in milliseconds */
  readonly timestamp: number
  /** Source-specific importance score (0-1). Defaults to 0.5 if omitted. */
  readonly importance?: number
}

/**
 * Result of named entity recognition (NER).
 */
export interface ExtractedEntities {
  readonly persons: readonly string[]
  readonly organizations: readonly string[]
  readonly locations: readonly string[]
  readonly technologies: readonly string[]
  readonly concepts: readonly string[]
}

/**
 * The merged context output — a unified representation of the user's
 * current activity across all context sources.
 */
export interface MergedContext {
  /** Unified summary describing the user's current activity */
  readonly summary: string
  /** Deduplicated keywords across all sources */
  readonly keywords: readonly string[]
  /** Deduplicated entity strings across all sources */
  readonly entities: readonly string[]
  /** Structured entities extracted via NER */
  readonly extractedEntities: ExtractedEntities
  /** Computed importance score (0-1) */
  readonly importance: number
  /** Classified activity type */
  readonly activityType: ActivityType
  /** Number of sources that contributed */
  readonly sourceCount: number
  /** Timestamp of the merge */
  readonly timestamp: number
}
