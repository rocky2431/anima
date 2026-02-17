import type { Conversation, Todo } from './types'

import Database from 'better-sqlite3'

/**
 * SQLite-backed document store for structured data.
 * Manages conversations, todos, settings, and intimacy tracking.
 * Uses WAL mode for improved concurrent read/write performance.
 */
export class DocumentStore {
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
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS todos (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        completed_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS intimacy (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        level REAL NOT NULL DEFAULT 0
      );

      INSERT OR IGNORE INTO intimacy (id, level) VALUES (1, 0);
    `)
  }

  // --- Conversations ---

  insertConversation(conv: Conversation): void {
    const stmt = this.db.prepare(
      'INSERT INTO conversations (id, role, content, created_at) VALUES (?, ?, ?, ?)',
    )
    stmt.run(conv.id, conv.role, conv.content, conv.createdAt)
  }

  getRecentConversations(limit: number): Conversation[] {
    const stmt = this.db.prepare(
      'SELECT id, role, content, created_at AS createdAt FROM conversations ORDER BY created_at DESC LIMIT ?',
    )
    return stmt.all(limit) as Conversation[]
  }

  // --- Todos ---

  upsertTodo(todo: Todo): void {
    const stmt = this.db.prepare(`
      INSERT INTO todos (id, title, completed, created_at, completed_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        completed = excluded.completed,
        completed_at = excluded.completed_at
    `)
    stmt.run(todo.id, todo.title, todo.completed ? 1 : 0, todo.createdAt, todo.completedAt)
  }

  getTodos(): Todo[] {
    const stmt = this.db.prepare(
      'SELECT id, title, completed, created_at AS createdAt, completed_at AS completedAt FROM todos ORDER BY created_at DESC',
    )
    const rows = stmt.all() as Array<{
      id: string
      title: string
      completed: number
      createdAt: number
      completedAt: number | null
    }>
    return rows.map(row => ({
      ...row,
      completed: row.completed === 1,
    }))
  }

  // --- Settings ---

  getSetting(key: string): string | null {
    const stmt = this.db.prepare('SELECT value FROM settings WHERE key = ?')
    const row = stmt.get(key) as { value: string } | undefined
    return row?.value ?? null
  }

  setSetting(key: string, value: string): void {
    const stmt = this.db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    )
    stmt.run(key, value)
  }

  // --- Intimacy ---

  getIntimacy(): number {
    const stmt = this.db.prepare('SELECT level FROM intimacy WHERE id = 1')
    const row = stmt.get() as { level: number } | undefined
    return row?.level ?? 0
  }

  updateIntimacy(delta: number): number {
    const stmt = this.db.prepare(
      'UPDATE intimacy SET level = MAX(0, level + ?) WHERE id = 1',
    )
    stmt.run(delta)
    return this.getIntimacy()
  }

  // --- Lifecycle ---

  close(): void {
    this.db.close()
  }
}
