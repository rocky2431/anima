import type { McpServerConfig, McpServerConfigInput, TransportType } from './types'

import Database from 'better-sqlite3'

import { nanoid } from 'nanoid'

import { VALID_TRANSPORTS } from './types'

const ALLOWED_COMMANDS: ReadonlySet<string> = new Set([
  'node',
  'npx',
  'python',
  'python3',
  'uvx',
  'docker',
  'deno',
  'bun',
  'bunx',
])

const SHELL_METACHAR_PATTERN = /[;|&$`\\<>(){}!#]/

export class McpServerStore {
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
      CREATE TABLE IF NOT EXISTS mcp_servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        transport TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        command TEXT,
        args TEXT,
        url TEXT,
        headers TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)
  }

  add(input: McpServerConfigInput): McpServerConfig {
    validateConfig(input)

    const now = Date.now()
    const base = {
      id: nanoid(),
      name: input.name,
      enabled: input.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    }

    const config = buildConfig(base, input)

    const stmt = this.db.prepare(`
      INSERT INTO mcp_servers (id, name, transport, enabled, command, args, url, headers, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const row = configToRow(config)
    stmt.run(
      row.id,
      row.name,
      row.transport,
      row.enabled,
      row.command,
      row.args,
      row.url,
      row.headers,
      row.created_at,
      row.updated_at,
    )

    return config
  }

  getAll(): McpServerConfig[] {
    const stmt = this.db.prepare('SELECT * FROM mcp_servers ORDER BY created_at ASC')
    const rows = stmt.all() as McpServerRow[]
    return rows.map(safeRowToConfig)
  }

  getById(id: string): McpServerConfig | undefined {
    const stmt = this.db.prepare('SELECT * FROM mcp_servers WHERE id = ?')
    const row = stmt.get(id) as McpServerRow | undefined
    return row ? safeRowToConfig(row) : undefined
  }

  getEnabled(): McpServerConfig[] {
    const stmt = this.db.prepare('SELECT * FROM mcp_servers WHERE enabled = 1 ORDER BY created_at ASC')
    const rows = stmt.all() as McpServerRow[]
    return rows.map(safeRowToConfig)
  }

  update(id: string, partial: Partial<McpServerConfigInput> & { enabled?: boolean }): McpServerConfig {
    const existing = this.getById(id)
    if (!existing) {
      throw new Error(`MCP server not found: ${id}`)
    }

    const mergedInput = buildMergedInput(existing, filterUndefined(partial))
    validateConfig(mergedInput)

    const base = {
      id: existing.id,
      name: mergedInput.name,
      enabled: mergedInput.enabled ?? true,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    }

    const config = buildConfig(base, mergedInput)

    const stmt = this.db.prepare(`
      UPDATE mcp_servers SET
        name = ?, transport = ?, enabled = ?, command = ?, args = ?, url = ?, headers = ?, updated_at = ?
      WHERE id = ?
    `)

    const row = configToRow(config)
    stmt.run(
      row.name,
      row.transport,
      row.enabled,
      row.command,
      row.args,
      row.url,
      row.headers,
      row.updated_at,
      id,
    )

    return config
  }

  remove(id: string): void {
    const existing = this.getById(id)
    if (!existing) {
      throw new Error(`MCP server not found: ${id}`)
    }

    const stmt = this.db.prepare('DELETE FROM mcp_servers WHERE id = ?')
    stmt.run(id)
  }

  close(): void {
    this.db.close()
  }
}

interface McpServerRow {
  id: string
  name: string
  transport: string
  enabled: number
  command: string | null
  args: string | null
  url: string | null
  headers: string | null
  created_at: number
  updated_at: number
}

function isTransportType(s: string): s is TransportType {
  return (VALID_TRANSPORTS as readonly string[]).includes(s)
}

function safeJsonParse<T>(json: string | null, fallback: T | undefined, context: string): T | undefined {
  if (json === null)
    return fallback
  try {
    return JSON.parse(json) as T
  }
  catch {
    throw new Error(`Corrupt JSON in ${context}: ${json.slice(0, 100)}`)
  }
}

function safeRowToConfig(row: McpServerRow): McpServerConfig {
  if (!isTransportType(row.transport)) {
    throw new Error(`Invalid transport type in database for server ${row.id}: ${row.transport}`)
  }

  const base = {
    id: row.id,
    name: row.name,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }

  switch (row.transport) {
    case 'stdio':
      return {
        ...base,
        transport: 'stdio',
        command: row.command ?? '',
        args: safeJsonParse<string[]>(row.args, undefined, `args for server ${row.id}`),
      }
    case 'sse':
      return {
        ...base,
        transport: 'sse',
        url: row.url ?? '',
        headers: safeJsonParse<Record<string, string>>(row.headers, undefined, `headers for server ${row.id}`),
      }
    case 'http':
      return {
        ...base,
        transport: 'http',
        url: row.url ?? '',
        headers: safeJsonParse<Record<string, string>>(row.headers, undefined, `headers for server ${row.id}`),
      }
  }
}

function configToRow(config: McpServerConfig): McpServerRow {
  const base = {
    id: config.id,
    name: config.name,
    transport: config.transport,
    enabled: config.enabled ? 1 : 0,
    command: null as string | null,
    args: null as string | null,
    url: null as string | null,
    headers: null as string | null,
    created_at: config.createdAt,
    updated_at: config.updatedAt,
  }

  switch (config.transport) {
    case 'stdio':
      return { ...base, command: config.command, args: config.args ? JSON.stringify(config.args) : null }
    case 'sse':
    case 'http':
      return { ...base, url: config.url, headers: config.headers ? JSON.stringify(config.headers) : null }
  }
}

function buildMergedInput(
  existing: McpServerConfig,
  partial: Record<string, unknown>,
): McpServerConfigInput {
  const name = (partial.name as string | undefined) ?? existing.name
  const enabled = (partial.enabled as boolean | undefined) ?? existing.enabled

  switch (existing.transport) {
    case 'stdio':
      return {
        name,
        enabled,
        transport: 'stdio',
        command: (partial.command as string | undefined) ?? existing.command,
        args: 'args' in partial ? (partial.args as string[] | undefined) : existing.args,
      }
    case 'sse':
      return {
        name,
        enabled,
        transport: 'sse',
        url: (partial.url as string | undefined) ?? existing.url,
        headers: 'headers' in partial ? (partial.headers as Record<string, string> | undefined) : existing.headers,
      }
    case 'http':
      return {
        name,
        enabled,
        transport: 'http',
        url: (partial.url as string | undefined) ?? existing.url,
        headers: 'headers' in partial ? (partial.headers as Record<string, string> | undefined) : existing.headers,
      }
  }
}

function buildConfig(
  base: { id: string, name: string, enabled: boolean, createdAt: number, updatedAt: number },
  input: McpServerConfigInput,
): McpServerConfig {
  switch (input.transport) {
    case 'stdio':
      return { ...base, transport: 'stdio', command: input.command, args: input.args }
    case 'sse':
      return { ...base, transport: 'sse', url: input.url, headers: input.headers }
    case 'http':
      return { ...base, transport: 'http', url: input.url, headers: input.headers }
  }
}

function validateConfig(input: McpServerConfigInput | McpServerConfig): void {
  if (!input.name || input.name.trim() === '') {
    throw new Error('Server name must not be empty')
  }

  switch (input.transport) {
    case 'stdio': {
      const command = 'command' in input ? input.command : undefined
      if (!command) {
        throw new Error('stdio transport requires "command"')
      }
      if (!ALLOWED_COMMANDS.has(command)) {
        throw new Error(
          `Command "${command}" is not in the allowlist. Allowed: ${[...ALLOWED_COMMANDS].join(', ')}`,
        )
      }
      const args = 'args' in input ? input.args : undefined
      if (args) {
        for (const arg of args) {
          if (SHELL_METACHAR_PATTERN.test(arg)) {
            throw new Error(`Argument contains shell metacharacters: "${arg}"`)
          }
        }
      }
      break
    }
    case 'sse': {
      const url = 'url' in input ? input.url : undefined
      if (!url) {
        throw new Error('sse transport requires "url"')
      }
      break
    }
    case 'http': {
      const url = 'url' in input ? input.url : undefined
      if (!url) {
        throw new Error('http transport requires "url"')
      }
      break
    }
  }
}

function filterUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Partial<T> = {}
  for (const key in obj) {
    if (obj[key] !== undefined) {
      result[key] = obj[key]
    }
  }
  return result
}
