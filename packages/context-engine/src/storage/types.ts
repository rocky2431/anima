/**
 * Known vector sources. Extensible via `VectorSource | (string & {})` if needed.
 */
export type VectorSource = 'screenshot' | 'conversation' | 'document' | 'memory' | 'preference' | 'relationship'

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

/**
 * A fact about the user extracted from conversations.
 */
export interface UserProfileFact {
  id: string
  /** The observed fact (e.g., "prefers dark mode", "works at company X") */
  fact: string
  /** Date when the evidence was observed (ISO date string) */
  evidenceDate: string
  /** Confidence level 0-1 */
  confidence: number
  /** Unix timestamp in milliseconds */
  createdAt: number
}

/**
 * A relationship the user has mentioned.
 */
export interface Relationship {
  id: string
  personName: string
  relationshipType: string
  /** Unix timestamp of last mention */
  lastMentioned: number
  /** Unix timestamp in milliseconds */
  createdAt: number
}

/**
 * An important date for the user (birthday, anniversary, deadline).
 */
export interface ImportantDate {
  id: string
  /** MM-DD for recurring or YYYY-MM-DD for one-time */
  date: string
  /** Category of date (e.g., 'birthday', 'anniversary', 'deadline') */
  dateType: string
  /** Short label */
  label: string
  /** Optional description */
  description: string
  /** Unix timestamp in milliseconds */
  createdAt: number
}

/**
 * A long-term memory entry extracted from daily conversations.
 */
export interface MemoryEntry {
  id: string
  /** The memory content */
  content: string
  /** Importance score 1-10 */
  importance: number
  /** Category (e.g., 'preference', 'event', 'habit', 'goal') */
  category: string
  /** Date when the memory was observed (ISO date string) */
  sourceDate: string
  /** Unix timestamp in milliseconds */
  createdAt: number
}
