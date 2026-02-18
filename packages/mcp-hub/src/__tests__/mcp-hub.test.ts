import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { McpHub } from '../mcp-hub'

const FIXTURE_SERVER = path.resolve(
  import.meta.dirname,
  'fixtures',
  'echo-mcp-server.ts',
)

describe('mcpHub', () => {
  let tmpDir: string
  let dbPath: string
  let hub: McpHub

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-hub-integration-'))
    dbPath = path.join(tmpDir, 'mcp-hub.db')
    hub = new McpHub(dbPath)
  })

  afterEach(async () => {
    await hub.shutdown()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('end-to-end: register → connect → aggregate → disconnect', () => {
    it('registers a server, connects, gets tools, then disconnects', async () => {
      const config = hub.addServer({
        name: 'echo-server',
        transport: 'stdio',
        command: 'npx',
        args: ['tsx', FIXTURE_SERVER],
      })

      expect(hub.listServers()).toHaveLength(1)

      await hub.connectServer(config.id)
      expect(hub.getServerStatus(config.id)).toBe('connected')

      const tools = await hub.aggregateTools()
      expect(Object.keys(tools).length).toBeGreaterThanOrEqual(2)
      expect(Object.keys(tools)).toContain('echo')
      expect(Object.keys(tools)).toContain('add')

      await hub.disconnectServer(config.id)
      expect(hub.getServerStatus(config.id)).toBe('disconnected')
    }, 30_000)
  })

  describe('lazy loading', () => {
    it('does not connect disabled servers on connectEnabled', async () => {
      hub.addServer({
        name: 'disabled-server',
        transport: 'stdio',
        command: 'npx',
        args: ['tsx', FIXTURE_SERVER],
        enabled: false,
      })

      const enabledConfig = hub.addServer({
        name: 'enabled-server',
        transport: 'stdio',
        command: 'npx',
        args: ['tsx', FIXTURE_SERVER],
      })

      await hub.connectEnabled()

      expect(hub.getServerStatus(enabledConfig.id)).toBe('connected')

      const disabledServer = hub.listServers().find(s => s.name === 'disabled-server')!
      expect(hub.getServerStatus(disabledServer.id)).toBe('disconnected')
    }, 30_000)
  })

  describe('remove server', () => {
    it('disconnects and removes a server', async () => {
      const config = hub.addServer({
        name: 'to-remove',
        transport: 'stdio',
        command: 'npx',
        args: ['tsx', FIXTURE_SERVER],
      })

      await hub.connectServer(config.id)
      await hub.removeServer(config.id)

      expect(hub.listServers()).toHaveLength(0)
      expect(hub.getServerStatus(config.id)).toBe('disconnected')
    }, 30_000)
  })

  describe('persistence across restart', () => {
    it('preserves server configs after shutdown and re-init', async () => {
      hub.addServer({
        name: 'persistent',
        transport: 'stdio',
        command: 'npx',
        args: ['tsx', FIXTURE_SERVER],
      })

      await hub.shutdown()

      const hub2 = new McpHub(dbPath)
      const servers = hub2.listServers()

      expect(servers).toHaveLength(1)
      expect(servers[0].name).toBe('persistent')
      expect(servers[0].transport).toBe('stdio')

      await hub2.shutdown()

      // Reopen for afterEach cleanup
      hub = new McpHub(dbPath)
    })
  })
})
