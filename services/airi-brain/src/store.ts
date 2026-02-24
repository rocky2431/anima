import type Database from 'better-sqlite3'

export interface ActivityEvent {
  id: string
  appName: string
  windowTitle: string
  description: string
  durationMs: number
  timestamp: number
}

export interface ActivitySummary {
  date: string
  highlights: string[]
  breakdown: Array<{ app: string, durationMs: number, description: string }>
  totalWorkDurationMs: number
}

export interface VisionConfig {
  enabled: boolean
  intervalMs: number
  similarityThreshold: number
  vlmProvider?: string
  vlmModel?: string
}

export interface EmbeddingConfig {
  provider: string
  apiKey: string
  baseURL: string
  model: string
}

export interface VisionStats {
  total: number
  uniqueCount: number
  duplicates: number
}

/**
 * Brain-specific storage layer that extends the shared DocumentStore DB
 * with tables for skills state, activity tracking, and vision config.
 */
export class BrainStore {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
    this.initTables()
  }

  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS skills_state (
        id TEXT PRIMARY KEY,
        active INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS activity_events (
        id TEXT PRIMARY KEY,
        app_name TEXT NOT NULL,
        window_title TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        duration_ms INTEGER NOT NULL DEFAULT 0,
        timestamp INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS activity_summaries (
        date TEXT PRIMARY KEY,
        highlights TEXT NOT NULL DEFAULT '[]',
        breakdown TEXT NOT NULL DEFAULT '[]',
        total_work_duration_ms INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS vision_config (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        enabled INTEGER NOT NULL DEFAULT 0,
        interval_ms INTEGER NOT NULL DEFAULT 60000,
        similarity_threshold REAL NOT NULL DEFAULT 5,
        vlm_provider TEXT,
        vlm_model TEXT
      );

      INSERT OR IGNORE INTO vision_config (singleton, enabled, interval_ms, similarity_threshold)
      VALUES (1, 0, 60000, 5);

      CREATE TABLE IF NOT EXISTS vision_stats (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        total INTEGER NOT NULL DEFAULT 0,
        unique_count INTEGER NOT NULL DEFAULT 0,
        duplicates INTEGER NOT NULL DEFAULT 0
      );

      INSERT OR IGNORE INTO vision_stats (singleton, total, unique_count, duplicates)
      VALUES (1, 0, 0, 0);

      CREATE TABLE IF NOT EXISTS embedding_config (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        provider TEXT NOT NULL DEFAULT '',
        api_key TEXT NOT NULL DEFAULT '',
        base_url TEXT NOT NULL DEFAULT '',
        model TEXT NOT NULL DEFAULT ''
      );

      INSERT OR IGNORE INTO embedding_config (singleton, provider, api_key, base_url, model)
      VALUES (1, '', '', '', '');

      CREATE TABLE IF NOT EXISTS provider_configs (
        provider_id TEXT PRIMARY KEY,
        config_json TEXT NOT NULL DEFAULT '{}',
        added INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL DEFAULT 0
      );
    `)
  }

  // --- Skills State ---

  setSkillActive(id: string, active: boolean): void {
    const stmt = this.db.prepare(`
      INSERT INTO skills_state (id, active, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        active = excluded.active,
        updated_at = excluded.updated_at
    `)
    stmt.run(id, active ? 1 : 0, Date.now())
  }

  getSkillActiveState(id: string): boolean | null {
    const stmt = this.db.prepare('SELECT active FROM skills_state WHERE id = ?')
    const row = stmt.get(id) as { active: number } | undefined
    if (row === undefined)
      return null
    return row.active === 1
  }

  getAllSkillStates(): Map<string, boolean> {
    const stmt = this.db.prepare('SELECT id, active FROM skills_state')
    const rows = stmt.all() as Array<{ id: string, active: number }>
    const map = new Map<string, boolean>()
    for (const row of rows) {
      map.set(row.id, row.active === 1)
    }
    return map
  }

  // --- Activity Events ---

  insertActivityEvent(event: ActivityEvent): void {
    const stmt = this.db.prepare(
      'INSERT INTO activity_events (id, app_name, window_title, description, duration_ms, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
    )
    stmt.run(event.id, event.appName, event.windowTitle, event.description, event.durationMs, event.timestamp)
  }

  getActivityEvents(options: { date?: string, limit?: number }): ActivityEvent[] {
    const limit = options.limit ?? 50
    if (options.date) {
      const dayStart = new Date(`${options.date}T00:00:00`).getTime()
      const dayEnd = dayStart + 86_400_000
      const stmt = this.db.prepare(
        `SELECT id, app_name AS appName, window_title AS windowTitle, description, duration_ms AS durationMs, timestamp
         FROM activity_events
         WHERE timestamp >= ? AND timestamp < ?
         ORDER BY timestamp DESC
         LIMIT ?`,
      )
      return stmt.all(dayStart, dayEnd, limit) as ActivityEvent[]
    }
    const stmt = this.db.prepare(
      `SELECT id, app_name AS appName, window_title AS windowTitle, description, duration_ms AS durationMs, timestamp
       FROM activity_events
       ORDER BY timestamp DESC
       LIMIT ?`,
    )
    return stmt.all(limit) as ActivityEvent[]
  }

  // --- Activity Summaries ---

  upsertActivitySummary(summary: ActivitySummary): void {
    const stmt = this.db.prepare(`
      INSERT INTO activity_summaries (date, highlights, breakdown, total_work_duration_ms)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        highlights = excluded.highlights,
        breakdown = excluded.breakdown,
        total_work_duration_ms = excluded.total_work_duration_ms
    `)
    stmt.run(
      summary.date,
      JSON.stringify(summary.highlights),
      JSON.stringify(summary.breakdown),
      summary.totalWorkDurationMs,
    )
  }

  getActivitySummary(date: string): ActivitySummary | null {
    const stmt = this.db.prepare(
      'SELECT date, highlights, breakdown, total_work_duration_ms AS totalWorkDurationMs FROM activity_summaries WHERE date = ?',
    )
    const row = stmt.get(date) as { date: string, highlights: string, breakdown: string, totalWorkDurationMs: number } | undefined
    if (!row)
      return null
    return {
      date: row.date,
      highlights: JSON.parse(row.highlights) as string[],
      breakdown: JSON.parse(row.breakdown) as ActivitySummary['breakdown'],
      totalWorkDurationMs: row.totalWorkDurationMs,
    }
  }

  // --- Vision Config ---

  setVisionConfig(config: VisionConfig): void {
    const stmt = this.db.prepare(`
      UPDATE vision_config SET
        enabled = ?,
        interval_ms = ?,
        similarity_threshold = ?,
        vlm_provider = ?,
        vlm_model = ?
      WHERE singleton = 1
    `)
    stmt.run(
      config.enabled ? 1 : 0,
      config.intervalMs,
      config.similarityThreshold,
      config.vlmProvider ?? null,
      config.vlmModel ?? null,
    )
  }

  getVisionConfig(): VisionConfig {
    const stmt = this.db.prepare(
      'SELECT enabled, interval_ms AS intervalMs, similarity_threshold AS similarityThreshold, vlm_provider AS vlmProvider, vlm_model AS vlmModel FROM vision_config WHERE singleton = 1',
    )
    const row = stmt.get() as {
      enabled: number
      intervalMs: number
      similarityThreshold: number
      vlmProvider: string | null
      vlmModel: string | null
    }
    return {
      enabled: row.enabled === 1,
      intervalMs: row.intervalMs,
      similarityThreshold: row.similarityThreshold,
      vlmProvider: row.vlmProvider ?? undefined,
      vlmModel: row.vlmModel ?? undefined,
    }
  }

  // --- Vision Stats ---

  updateVisionStats(stats: VisionStats): void {
    const stmt = this.db.prepare(`
      UPDATE vision_stats SET
        total = ?,
        unique_count = ?,
        duplicates = ?
      WHERE singleton = 1
    `)
    stmt.run(stats.total, stats.uniqueCount, stats.duplicates)
  }

  getVisionStats(): VisionStats {
    const stmt = this.db.prepare(
      'SELECT total, unique_count AS uniqueCount, duplicates FROM vision_stats WHERE singleton = 1',
    )
    return stmt.get() as VisionStats
  }

  // --- Embedding Config ---

  setEmbeddingConfig(config: EmbeddingConfig): void {
    const stmt = this.db.prepare(`
      UPDATE embedding_config SET
        provider = ?,
        api_key = ?,
        base_url = ?,
        model = ?
      WHERE singleton = 1
    `)
    stmt.run(config.provider, config.apiKey, config.baseURL, config.model)
  }

  getEmbeddingConfig(): EmbeddingConfig {
    const stmt = this.db.prepare(
      'SELECT provider, api_key AS apiKey, base_url AS baseURL, model FROM embedding_config WHERE singleton = 1',
    )
    return stmt.get() as EmbeddingConfig
  }

  // --- Provider Configs ---

  setProviderConfigs(configs: Record<string, Record<string, unknown>>, added: Record<string, boolean>): void {
    const upsert = this.db.prepare(`
      INSERT INTO provider_configs (provider_id, config_json, added, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(provider_id) DO UPDATE SET
        config_json = excluded.config_json,
        added = excluded.added,
        updated_at = excluded.updated_at
    `)

    const now = Date.now()
    const run = this.db.transaction(() => {
      for (const [providerId, config] of Object.entries(configs)) {
        const hasCredentials = Object.values(config).some(v => typeof v === 'string' && v.length > 0)
        if (!hasCredentials)
          continue
        upsert.run(providerId, JSON.stringify(config), added[providerId] ? 1 : 0, now)
      }
    })
    run()
  }

  getProviderConfigs(): { configs: Record<string, Record<string, unknown>>, added: Record<string, boolean> } {
    const stmt = this.db.prepare('SELECT provider_id, config_json, added FROM provider_configs')
    const rows = stmt.all() as Array<{ provider_id: string, config_json: string, added: number }>

    const configs: Record<string, Record<string, unknown>> = {}
    const added: Record<string, boolean> = {}

    for (const row of rows) {
      configs[row.provider_id] = JSON.parse(row.config_json) as Record<string, unknown>
      if (row.added === 1)
        added[row.provider_id] = true
    }

    return { configs, added }
  }
}
