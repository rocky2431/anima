/**
 * Known vector sources. Extensible via `VectorSource | (string & {})` if needed.
 */
export type VectorSource = 'screenshot' | 'conversation' | 'document'

/**
 * A vector record stored in LanceDB.
 */
export interface ContextVector {
  /** Unique identifier for this vector */
  id: string
  /** The embedding vector */
  vector: number[]
  /** Source of the vector */
  source: VectorSource
  /** Human-readable content associated with this vector */
  content: string
  /** Unix timestamp in milliseconds when this record was created */
  createdAt: number
}

/**
 * Result from a vector similarity search.
 */
export interface VectorSearchResult {
  /** The matched vector record */
  id: string
  source: VectorSource
  content: string
  createdAt: number
  /** Distance/score from the query vector (lower = more similar for L2) */
  _distance: number
}

/**
 * Valid conversation roles.
 */
export type ConversationRole = 'user' | 'assistant' | 'system'

/**
 * A conversation turn stored in SQLite.
 */
export interface Conversation {
  /** Unique identifier */
  id: string
  role: ConversationRole
  /** Message content */
  content: string
  /** Unix timestamp in milliseconds */
  createdAt: number
}

/**
 * A todo item stored in SQLite.
 */
export interface Todo {
  /** Unique identifier */
  id: string
  /** Todo title */
  title: string
  /** Whether the todo is completed */
  completed: boolean
  /** Unix timestamp in milliseconds */
  createdAt: number
  /** Unix timestamp in milliseconds when completed */
  completedAt: number | null
}
