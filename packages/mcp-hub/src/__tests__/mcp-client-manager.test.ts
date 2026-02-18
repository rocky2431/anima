import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { McpClientManager } from '../mcp-client-manager'
import { McpServerStore } from '../server-store'

const FIXTURE_SERVER = path.resolve(
  import.meta.dirname,
  'fixtures',
  'echo-mcp-server.ts',
)

describe('mcpClientManager', () => {
  let tmpDir: string
  let dbPath: string
  let store: McpServerStore
  let manager: McpClientManager

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-manager-test-'))
    dbPath = path.join(tmpDir, 'mcp-hub.db')
    store = new McpServerStore(dbPath)
    manager = new McpClientManager()
  })

  afterEach(async () => {
    await manager.disconnectAll()
    store.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('connect', () => {
    it('connects to a stdio MCP server and retrieves tools', async () => {
      const config = store.add({
        name: 'echo-server',
        transport: 'stdio',
        command: 'npx',
        args: ['tsx', FIXTURE_SERVER],
      })

      await manager.connect(config)

      expect(manager.isConnected(config.id)).toBe(true)

      const tools = await manager.getTools(config.id)
      expect(tools).toBeDefined()

      const toolNames = Object.keys(tools)
      expect(toolNames).toContain('echo')
      expect(toolNames).toContain('add')
    }, 30_000)

    it('throws when connecting to already connected server', async () => {
      const config = store.add({
        name: 'echo-server',
        transport: 'stdio',
        command: 'npx',
        args: ['tsx', FIXTURE_SERVER],
      })

      await manager.connect(config)

      await expect(manager.connect(config))
        .rejects
        .toThrow(`Server already connected: ${config.id}`)
    }, 30_000)
  })

  describe('disconnect', () => {
    it('disconnects a connected server', async () => {
      const config = store.add({
        name: 'echo-server',
        transport: 'stdio',
        command: 'npx',
        args: ['tsx', FIXTURE_SERVER],
      })

      await manager.connect(config)
      expect(manager.isConnected(config.id)).toBe(true)

      await manager.disconnect(config.id)
      expect(manager.isConnected(config.id)).toBe(false)
    }, 30_000)

    it('is idempotent for non-connected servers', async () => {
      await expect(manager.disconnect('non-existent')).resolves.not.toThrow()
    })
  })

  describe('aggregateTools', () => {
    it('returns empty object when no servers connected', async () => {
      const tools = await manager.aggregateTools()
      expect(tools).toEqual({})
    })

    it('aggregates tools from a connected stdio server', async () => {
      const config = store.add({
        name: 'echo-server',
        transport: 'stdio',
        command: 'npx',
        args: ['tsx', FIXTURE_SERVER],
      })

      await manager.connect(config)
      const tools = await manager.aggregateTools()

      expect(Object.keys(tools)).toContain('echo')
      expect(Object.keys(tools)).toContain('add')
    }, 30_000)
  })

  describe('getConnectedIds', () => {
    it('returns empty array initially', () => {
      expect(manager.getConnectedIds()).toEqual([])
    })

    it('returns connected server ids', async () => {
      const config = store.add({
        name: 'echo-server',
        transport: 'stdio',
        command: 'npx',
        args: ['tsx', FIXTURE_SERVER],
      })

      await manager.connect(config)
      expect(manager.getConnectedIds()).toEqual([config.id])
    }, 30_000)
  })
})
