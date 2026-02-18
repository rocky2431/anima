import type { HttpServerConfig, McpServerConfig, McpServerConfigInput, SseServerConfig, StdioServerConfig } from '../types'

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { McpServerStore } from '../server-store'

describe('mcpServerStore', () => {
  let tmpDir: string
  let dbPath: string
  let store: McpServerStore

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-hub-test-'))
    dbPath = path.join(tmpDir, 'mcp-hub.db')
    store = new McpServerStore(dbPath)
  })

  afterEach(() => {
    store.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('add', () => {
    it('adds a stdio server config and returns it with generated id', () => {
      const input: McpServerConfigInput = {
        name: 'github-mcp',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
      }

      const config = store.add(input)

      expect(config.id).toBeDefined()
      expect(config.id).toHaveLength(21)
      expect(config.name).toBe('github-mcp')
      expect(config.transport).toBe('stdio')

      const stdio = config as StdioServerConfig
      expect(stdio.command).toBe('npx')
      expect(stdio.args).toEqual(['-y', '@modelcontextprotocol/server-github'])
      expect(config.enabled).toBe(true)
      expect(config.createdAt).toBeGreaterThan(0)
      expect(config.updatedAt).toBeGreaterThan(0)
    })

    it('adds an SSE server config', () => {
      const config = store.add({
        name: 'remote-tools',
        transport: 'sse',
        url: 'https://example.com/sse',
        headers: { Authorization: 'Bearer token123' },
      })

      expect(config.transport).toBe('sse')
      const sse = config as SseServerConfig
      expect(sse.url).toBe('https://example.com/sse')
      expect(sse.headers).toEqual({ Authorization: 'Bearer token123' })
    })

    it('adds an HTTP server config', () => {
      const config = store.add({
        name: 'http-tools',
        transport: 'http',
        url: 'http://localhost:3000/mcp',
      })

      expect(config.transport).toBe('http')
      const http = config as HttpServerConfig
      expect(http.url).toBe('http://localhost:3000/mcp')
    })

    it('defaults enabled to true when not specified', () => {
      const config = store.add({
        name: 'test',
        transport: 'stdio',
        command: 'node',
      })

      expect(config.enabled).toBe(true)
    })

    it('respects enabled=false when explicitly set', () => {
      const config = store.add({
        name: 'disabled-server',
        transport: 'stdio',
        command: 'node',
        enabled: false,
      })

      expect(config.enabled).toBe(false)
    })
  })

  describe('getAll', () => {
    it('returns empty array when no servers configured', () => {
      expect(store.getAll()).toEqual([])
    })

    it('returns all configured servers', () => {
      store.add({ name: 'server-1', transport: 'stdio', command: 'node' })
      store.add({ name: 'server-2', transport: 'sse', url: 'https://example.com/sse' })

      const servers = store.getAll()
      expect(servers).toHaveLength(2)
      expect(servers.map((s: McpServerConfig) => s.name)).toContain('server-1')
      expect(servers.map((s: McpServerConfig) => s.name)).toContain('server-2')
    })
  })

  describe('getById', () => {
    it('returns server config by id', () => {
      const added = store.add({ name: 'test', transport: 'stdio', command: 'node' })

      const found = store.getById(added.id)
      expect(found).toBeDefined()
      expect(found!.name).toBe('test')
    })

    it('returns undefined for non-existent id', () => {
      expect(store.getById('non-existent')).toBeUndefined()
    })
  })

  describe('getEnabled', () => {
    it('returns only enabled servers', () => {
      store.add({ name: 'enabled-1', transport: 'stdio', command: 'node', enabled: true })
      store.add({ name: 'disabled', transport: 'stdio', command: 'node', enabled: false })
      store.add({ name: 'enabled-2', transport: 'sse', url: 'https://example.com/sse' })

      const enabled = store.getEnabled()
      expect(enabled).toHaveLength(2)
      expect(enabled.map((s: McpServerConfig) => s.name)).toContain('enabled-1')
      expect(enabled.map((s: McpServerConfig) => s.name)).toContain('enabled-2')
    })
  })

  describe('update', () => {
    it('updates server name', () => {
      const added = store.add({ name: 'old-name', transport: 'stdio', command: 'node' })

      const updated = store.update(added.id, { name: 'new-name' })
      expect(updated.name).toBe('new-name')
      expect(updated.updatedAt).toBeGreaterThanOrEqual(added.updatedAt)
    })

    it('updates server enabled status', () => {
      const added = store.add({ name: 'test', transport: 'stdio', command: 'node' })

      const updated = store.update(added.id, { enabled: false })
      expect(updated.enabled).toBe(false)
    })

    it('updates server url', () => {
      const added = store.add({ name: 'test', transport: 'sse', url: 'https://old.com/sse' })

      const updated = store.update(added.id, { url: 'https://new.com/sse' })
      const sse = updated as SseServerConfig
      expect(sse.url).toBe('https://new.com/sse')
    })

    it('throws for non-existent id', () => {
      expect(() => store.update('non-existent', { name: 'test' }))
        .toThrow('MCP server not found: non-existent')
    })
  })

  describe('remove', () => {
    it('removes server by id', () => {
      const added = store.add({ name: 'to-remove', transport: 'stdio', command: 'node' })

      store.remove(added.id)
      expect(store.getById(added.id)).toBeUndefined()
      expect(store.getAll()).toHaveLength(0)
    })

    it('throws for non-existent id', () => {
      expect(() => store.remove('non-existent'))
        .toThrow('MCP server not found: non-existent')
    })
  })

  describe('persistence', () => {
    it('persists data across reconnect', () => {
      store.add({ name: 'persistent-server', transport: 'stdio', command: 'npx', args: ['some-server'] })
      store.add({ name: 'sse-server', transport: 'sse', url: 'https://example.com/sse', enabled: false })
      store.close()

      const store2 = new McpServerStore(dbPath)
      const servers = store2.getAll()

      expect(servers).toHaveLength(2)

      const stdio = servers.find((s: McpServerConfig) => s.name === 'persistent-server')! as StdioServerConfig
      expect(stdio.transport).toBe('stdio')
      expect(stdio.command).toBe('npx')
      expect(stdio.args).toEqual(['some-server'])
      expect(stdio.enabled).toBe(true)

      const sse = servers.find((s: McpServerConfig) => s.name === 'sse-server')! as SseServerConfig
      expect(sse.transport).toBe('sse')
      expect(sse.url).toBe('https://example.com/sse')
      expect(sse.enabled).toBe(false)

      store2.close()

      // Reopen for afterEach cleanup
      store = new McpServerStore(dbPath)
    })

    it('persists updates across reconnect', () => {
      const added = store.add({ name: 'updatable', transport: 'stdio', command: 'node' })
      store.update(added.id, { name: 'updated-name', enabled: false })
      store.close()

      const store2 = new McpServerStore(dbPath)
      const found = store2.getById(added.id)

      expect(found).toBeDefined()
      expect(found!.name).toBe('updated-name')
      expect(found!.enabled).toBe(false)

      store2.close()
      store = new McpServerStore(dbPath)
    })
  })

  describe('boundary: invalid input', () => {
    it('validates stdio transport requires command', () => {
      expect(() => store.add({ name: 'bad', transport: 'stdio' } as McpServerConfigInput))
        .toThrow('stdio transport requires "command"')
    })

    it('validates sse transport requires url', () => {
      expect(() => store.add({ name: 'bad', transport: 'sse' } as McpServerConfigInput))
        .toThrow('sse transport requires "url"')
    })

    it('validates http transport requires url', () => {
      expect(() => store.add({ name: 'bad', transport: 'http' } as McpServerConfigInput))
        .toThrow('http transport requires "url"')
    })

    it('validates name is non-empty', () => {
      expect(() => store.add({ name: '', transport: 'stdio', command: 'node' }))
        .toThrow('Server name must not be empty')
    })
  })

  describe('security: command allowlist', () => {
    it('rejects commands not in allowlist', () => {
      expect(() => store.add({ name: 'bad', transport: 'stdio', command: 'rm' }))
        .toThrow('Command "rm" is not in the allowlist')
    })

    it('rejects args containing shell metacharacters', () => {
      expect(() => store.add({ name: 'bad', transport: 'stdio', command: 'node', args: ['--flag; rm -rf /'] }))
        .toThrow('Argument contains shell metacharacters')
    })

    it('accepts all allowed commands', () => {
      const allowed = ['node', 'npx', 'python', 'python3', 'uvx', 'docker', 'deno', 'bun', 'bunx']
      for (const command of allowed) {
        const config = store.add({ name: `test-${command}`, transport: 'stdio', command })
        expect(config.transport).toBe('stdio')
      }
    })

    it('validates command on update too', () => {
      const added = store.add({ name: 'test', transport: 'stdio', command: 'node' })
      expect(() => store.update(added.id, { command: 'rm' } as Partial<McpServerConfigInput>))
        .toThrow('Command "rm" is not in the allowlist')
    })
  })
})
