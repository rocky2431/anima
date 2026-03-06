import type { InvocableEventContext } from '@moeru/eventa'
import type { AnimaUserContext, MemoryResult } from '@anase/mcp-hub'
import type { ContextInit } from '@anase/plugin-sdk/plugin'
import type Database from 'better-sqlite3'

import process from 'node:process'

import { defineInvokeEventa, defineInvokeHandler } from '@moeru/eventa'
import {
  animaDailySummary,
  animaGetUserContext,
  animaMemoryRecent,
  animaMemorySearch,
} from '@anase/anase-plugin-anima-mcp-server'
import { DocumentStore } from '@anase/context-engine'
import { definePlugin } from '@anase/plugin-sdk/plugin'

// ---------------------------------------------------------------------------
// Own invoke events — other plugins can consume context-engine data directly
// without going through the Anima MCP Server.
// ---------------------------------------------------------------------------

export const contextEngineMemorySearch = defineInvokeEventa<
  MemoryResult[],
  { query: string, limit: number }
>('airi:plugin:context-engine:memory:search')

export const contextEngineMemoryRecent = defineInvokeEventa<
  MemoryResult[],
  { limit: number }
>('airi:plugin:context-engine:memory:recent')

export const contextEngineDailySummary = defineInvokeEventa<
  string,
  { date?: string }
>('airi:plugin:context-engine:daily-summary')

export const contextEngineUserContext = defineInvokeEventa<
  AnimaUserContext
>('airi:plugin:context-engine:user-context')

// ---------------------------------------------------------------------------
// Data access helpers (read-only against shared SQLite DB)
// ---------------------------------------------------------------------------

function toMemoryResult(entry: { content: string, importance: number, category: string, sourceDate: string }): MemoryResult {
  return {
    content: entry.content,
    importance: entry.importance,
    category: entry.category,
    sourceDate: entry.sourceDate,
  }
}

function searchMemories(store: DocumentStore, query: string, limit: number): MemoryResult[] {
  return store.searchMemoryEntries(query, limit).map(toMemoryResult)
}

function getRecentMemories(store: DocumentStore, limit: number): MemoryResult[] {
  return store.getMemoryEntries(limit).map(toMemoryResult)
}

/**
 * Read daily summary from BrainStore's activity_summaries table.
 * The table is created by Brain service — if it doesn't exist yet, returns a fallback message.
 */
function getDailySummary(db: Database.Database, date?: string): string {
  const targetDate = date ?? new Date().toISOString().slice(0, 10)

  try {
    const stmt = db.prepare(
      'SELECT highlights, breakdown, total_work_duration_ms AS totalWorkDurationMs FROM activity_summaries WHERE date = ?',
    )
    const row = stmt.get(targetDate) as {
      highlights: string
      breakdown: string
      totalWorkDurationMs: number
    } | undefined

    if (!row) {
      return `No activity summary available for ${targetDate}.`
    }

    const highlights = JSON.parse(row.highlights) as string[]
    const breakdown = JSON.parse(row.breakdown) as Array<{ app: string, durationMs: number, description: string }>

    const lines: string[] = [`Daily Summary for ${targetDate}:`]
    if (highlights.length > 0) {
      lines.push('', 'Highlights:')
      for (const h of highlights) {
        lines.push(`  - ${h}`)
      }
    }
    if (breakdown.length > 0) {
      lines.push('', 'Activity Breakdown:')
      for (const b of breakdown) {
        const hours = (b.durationMs / 3_600_000).toFixed(1)
        lines.push(`  - ${b.app}: ${hours}h — ${b.description}`)
      }
    }
    lines.push('', `Total work duration: ${(row.totalWorkDurationMs / 3_600_000).toFixed(1)}h`)
    return lines.join('\n')
  }
  catch {
    // Table may not exist if Brain hasn't started yet
    return `No activity summary available for ${targetDate}.`
  }
}

function getUserContext(store: DocumentStore): AnimaUserContext {
  const intimacyLevel = store.getIntimacy()
  const profileFacts = store.getProfileFacts().map(f => f.fact)
  const relationships = store.getRelationships().map(r => ({
    name: r.personName,
    type: r.relationshipType,
  }))

  const recentConvs = store.getRecentConversations(20)
  const recentTopics = [...new Set(
    recentConvs
      .filter(c => c.role === 'user')
      .map(c => c.content.slice(0, 100)),
  )].slice(0, 10)

  return { intimacyLevel, profileFacts, relationships, recentTopics }
}

// ---------------------------------------------------------------------------
// Plugin definition
// ---------------------------------------------------------------------------

let documentStore: DocumentStore | null = null

export default definePlugin('anase-plugin-context-engine', '0.8.4', () => ({
  async init(_ctx: ContextInit): Promise<void | false> {
    const dataDir = process.env.ANASE_DATA_DIR
    const dbPath = dataDir
      ? `${dataDir}/anima.db`
      : (process.env.ANASE_CONTEXT_ENGINE_DB_PATH ?? './data/anima.db')

    documentStore = new DocumentStore(dbPath)
  },

  async setupModules({ channels }: ContextInit): Promise<void> {
    if (!documentStore) {
      throw new Error('DocumentStore not initialized — init() must succeed before setupModules()')
    }

    const ctx = channels.host as InvocableEventContext<unknown, { raw?: unknown }>
    const db = documentStore.getDatabase()

    // Register handlers for Anima MCP Server's provider events (P3-2 bridge)
    defineInvokeHandler(ctx, animaMemorySearch, async ({ query, limit }) => {
      return searchMemories(documentStore!, query, limit)
    })

    defineInvokeHandler(ctx, animaMemoryRecent, async ({ limit }) => {
      return getRecentMemories(documentStore!, limit)
    })

    defineInvokeHandler(ctx, animaDailySummary, async ({ date }) => {
      return getDailySummary(db, date)
    })

    defineInvokeHandler(ctx, animaGetUserContext, async () => {
      return getUserContext(documentStore!)
    })

    // Register own events (direct plugin-to-plugin access)
    defineInvokeHandler(ctx, contextEngineMemorySearch, async ({ query, limit }) => {
      return searchMemories(documentStore!, query, limit)
    })

    defineInvokeHandler(ctx, contextEngineMemoryRecent, async ({ limit }) => {
      return getRecentMemories(documentStore!, limit)
    })

    defineInvokeHandler(ctx, contextEngineDailySummary, async ({ date }) => {
      return getDailySummary(db, date)
    })

    defineInvokeHandler(ctx, contextEngineUserContext, async () => {
      return getUserContext(documentStore!)
    })
  },
}))
