import type { CronJobRecord } from './cron-types'

import Database from 'better-sqlite3'

import { VALID_MODES } from './cron-types'

export class JobStore {
  private db: Database.Database

  constructor(dbPath: string) {
    this.db = new Database(dbPath)
    try {
      this.db.pragma('journal_mode = WAL')
      this.db.pragma('synchronous = NORMAL')
      this.initTables()
    }
    catch (err) {
      this.db.close()
      throw err
    }
  }

  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cron_jobs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        mode TEXT NOT NULL CHECK (mode IN ('at', 'every', 'cron')),
        schedule TEXT NOT NULL,
        handler TEXT NOT NULL,
        payload TEXT,
        timezone TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        last_run_at TEXT,
        run_count INTEGER NOT NULL DEFAULT 0
      )
    `)
  }

  save(job: CronJobRecord): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO cron_jobs (id, name, mode, schedule, handler, payload, timezone, enabled, created_at, last_run_at, run_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      job.id,
      job.name,
      job.mode,
      job.schedule,
      job.handler,
      job.payload,
      job.timezone,
      job.enabled ? 1 : 0,
      job.createdAt,
      job.lastRunAt,
      job.runCount,
    )
  }

  get(id: string): CronJobRecord | undefined {
    const row = this.db.prepare('SELECT * FROM cron_jobs WHERE id = ?').get(id) as JobRow | undefined
    return row ? mapRow(row) : undefined
  }

  list(): CronJobRecord[] {
    const rows = this.db.prepare('SELECT * FROM cron_jobs ORDER BY created_at ASC').all() as JobRow[]
    return rows.map(mapRow)
  }

  remove(id: string): boolean {
    const result = this.db.prepare('DELETE FROM cron_jobs WHERE id = ?').run(id)
    return result.changes > 0
  }

  incrementRunCount(id: string, lastRunAt: string): void {
    this.db.prepare(
      'UPDATE cron_jobs SET last_run_at = ?, run_count = run_count + 1 WHERE id = ?',
    ).run(lastRunAt, id)
  }

  close(): void {
    this.db.close()
  }
}

interface JobRow {
  id: string
  name: string
  mode: string
  schedule: string
  handler: string
  payload: string | null
  timezone: string | null
  enabled: number
  created_at: string
  last_run_at: string | null
  run_count: number
}

function mapRow(row: JobRow): CronJobRecord {
  const mode = row.mode
  if (!VALID_MODES.includes(mode as CronJobRecord['mode'])) {
    throw new Error(`Invalid schedule mode in database: '${mode}'`)
  }

  return {
    id: row.id,
    name: row.name,
    mode: mode as CronJobRecord['mode'],
    schedule: row.schedule,
    handler: row.handler,
    payload: row.payload,
    timezone: row.timezone,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    lastRunAt: row.last_run_at,
    runCount: row.run_count,
  }
}
