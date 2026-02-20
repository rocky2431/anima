/**
 * UI-layer types for memory management panels.
 * Mirror the context-engine types for use in browser/renderer.
 */

export interface MemoryEntryUI {
  id: string
  content: string
  importance: number
  category: MemoryCategory
  sourceDate: string
  createdAt: number
}

export type MemoryCategory = 'preference' | 'event' | 'habit' | 'goal' | 'emotion'

export const MEMORY_CATEGORIES: readonly MemoryCategory[] = [
  'preference',
  'event',
  'habit',
  'goal',
  'emotion',
] as const

export interface TodoUI {
  id: string
  title: string
  completed: boolean
  createdAt: number
  completedAt: number | null
}

export type TodoFilter = 'all' | 'active' | 'completed'

export interface ActivityEntryUI {
  timestamp: number
  app: string
  description: string
  durationMs: number
}

export interface DailySummaryUI {
  date: string
  highlights: string[]
  activityBreakdown: ActivityBreakdownEntryUI[]
  totalWorkDurationMs: number
  personalNote: string
}

export interface ActivityBreakdownEntryUI {
  app: string
  durationMs: number
  description: string
}

export interface SkillUI {
  id: string
  name: string
  category: string
  version: string
  description: string
  source: 'builtin' | 'user'
  tags: string[]
  active: boolean
}
