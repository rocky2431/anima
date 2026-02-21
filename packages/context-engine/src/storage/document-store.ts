import type { Conversation, ImportantDate, MemoryEntry, Relationship, Todo, UserProfileFact } from './types'

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

      CREATE TABLE IF NOT EXISTS user_profile_facts (
        id TEXT PRIMARY KEY,
        fact TEXT NOT NULL,
        evidence_date TEXT NOT NULL,
        confidence REAL NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS relationships (
        id TEXT PRIMARY KEY,
        person_name TEXT NOT NULL UNIQUE,
        relationship_type TEXT NOT NULL,
        last_mentioned INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS important_dates (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        date_type TEXT NOT NULL,
        label TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS memory_entries (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        importance INTEGER NOT NULL,
        category TEXT NOT NULL,
        source_date TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
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

  deleteTodo(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM todos WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
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

  // --- Profile Facts ---

  insertProfileFact(fact: UserProfileFact): void {
    const stmt = this.db.prepare(
      'INSERT INTO user_profile_facts (id, fact, evidence_date, confidence, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    stmt.run(fact.id, fact.fact, fact.evidenceDate, fact.confidence, fact.createdAt)
  }

  getProfileFacts(): UserProfileFact[] {
    const stmt = this.db.prepare(
      'SELECT id, fact, evidence_date AS evidenceDate, confidence, created_at AS createdAt FROM user_profile_facts ORDER BY created_at DESC',
    )
    return stmt.all() as UserProfileFact[]
  }

  // --- Relationships ---

  upsertRelationship(rel: Relationship): void {
    const stmt = this.db.prepare(`
      INSERT INTO relationships (id, person_name, relationship_type, last_mentioned, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(person_name) DO UPDATE SET
        relationship_type = excluded.relationship_type,
        last_mentioned = excluded.last_mentioned
    `)
    stmt.run(rel.id, rel.personName, rel.relationshipType, rel.lastMentioned, rel.createdAt)
  }

  getRelationships(): Relationship[] {
    const stmt = this.db.prepare(
      'SELECT id, person_name AS personName, relationship_type AS relationshipType, last_mentioned AS lastMentioned, created_at AS createdAt FROM relationships ORDER BY last_mentioned DESC',
    )
    return stmt.all() as Relationship[]
  }

  getRelationshipByName(personName: string): Relationship | null {
    const stmt = this.db.prepare(
      'SELECT id, person_name AS personName, relationship_type AS relationshipType, last_mentioned AS lastMentioned, created_at AS createdAt FROM relationships WHERE person_name = ?',
    )
    return (stmt.get(personName) as Relationship) ?? null
  }

  // --- Important Dates ---

  insertImportantDate(date: ImportantDate): void {
    const stmt = this.db.prepare(
      'INSERT INTO important_dates (id, date, date_type, label, description, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    stmt.run(date.id, date.date, date.dateType, date.label, date.description, date.createdAt)
  }

  getImportantDates(): ImportantDate[] {
    const stmt = this.db.prepare(
      'SELECT id, date, date_type AS dateType, label, description, created_at AS createdAt FROM important_dates ORDER BY created_at DESC',
    )
    return stmt.all() as ImportantDate[]
  }

  getImportantDatesForToday(monthDay: string): ImportantDate[] {
    const stmt = this.db.prepare(
      `SELECT id, date, date_type AS dateType, label, description, created_at AS createdAt
       FROM important_dates
       WHERE date = ? OR date LIKE ?
       ORDER BY created_at DESC`,
    )
    return stmt.all(monthDay, `%-${monthDay}`) as ImportantDate[]
  }

  // --- Memory Entries ---

  insertMemoryEntry(entry: MemoryEntry): void {
    const stmt = this.db.prepare(
      'INSERT INTO memory_entries (id, content, importance, category, source_date, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    stmt.run(entry.id, entry.content, entry.importance, entry.category, entry.sourceDate, entry.createdAt)
  }

  getMemoryEntries(limit: number): MemoryEntry[] {
    const stmt = this.db.prepare(
      'SELECT id, content, importance, category, source_date AS sourceDate, created_at AS createdAt FROM memory_entries ORDER BY created_at DESC LIMIT ?',
    )
    return stmt.all(limit) as MemoryEntry[]
  }

  getMemoryEntriesByCategory(category: string, limit: number): MemoryEntry[] {
    const stmt = this.db.prepare(
      'SELECT id, content, importance, category, source_date AS sourceDate, created_at AS createdAt FROM memory_entries WHERE category = ? ORDER BY created_at DESC LIMIT ?',
    )
    return stmt.all(category, limit) as MemoryEntry[]
  }

  deleteMemoryEntry(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM memory_entries WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  searchMemoryEntries(query: string, limit: number): MemoryEntry[] {
    const stmt = this.db.prepare(
      `SELECT id, content, importance, category, source_date AS sourceDate, created_at AS createdAt
       FROM memory_entries
       WHERE content LIKE '%' || ? || '%'
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    return stmt.all(query, limit) as MemoryEntry[]
  }

  // --- Lifecycle ---

  /**
   * Access the underlying better-sqlite3 Database instance.
   * Useful for sharing the connection with extension stores (e.g. BrainStore).
   */
  getDatabase(): Database.Database {
    return this.db
  }

  close(): void {
    this.db.close()
  }
}
