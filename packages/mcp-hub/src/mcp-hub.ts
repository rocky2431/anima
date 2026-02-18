import type { McpServerConfig, McpServerConfigInput } from './types'

import { McpClientManager } from './mcp-client-manager'
import { McpServerStore } from './server-store'

export type ServerStatus = 'connected' | 'disconnected'

export interface ConnectEnabledResult {
  connected: string[]
  failed: Array<{ id: string, error: string }>
}

export class McpHub {
  private store: McpServerStore
  private clientManager: McpClientManager

  constructor(dbPath: string) {
    this.store = new McpServerStore(dbPath)
    this.clientManager = new McpClientManager()
  }

  addServer(input: McpServerConfigInput): McpServerConfig {
    return this.store.add(input)
  }

  listServers(): McpServerConfig[] {
    return this.store.getAll()
  }

  getServer(id: string): McpServerConfig | undefined {
    return this.store.getById(id)
  }

  updateServer(id: string, partial: Partial<McpServerConfigInput>): McpServerConfig {
    return this.store.update(id, partial)
  }

  async removeServer(id: string): Promise<void> {
    if (this.clientManager.isConnected(id)) {
      try { await this.clientManager.disconnect(id) }
      catch (err) {
        console.warn(`Failed to disconnect MCP server ${id} during removal`, { cause: err })
      }
    }
    this.store.remove(id)
  }

  async connectServer(id: string): Promise<void> {
    const config = this.store.getById(id)
    if (!config) {
      throw new Error(`MCP server not found: ${id}`)
    }
    await this.clientManager.connect(config)
  }

  async disconnectServer(id: string): Promise<void> {
    await this.clientManager.disconnect(id)
  }

  async connectEnabled(): Promise<ConnectEnabledResult> {
    const enabled = this.store.getEnabled()
    const results = await Promise.allSettled(
      enabled.map(async (config) => {
        await this.clientManager.connect(config)
        return config.id
      }),
    )

    const connected: string[] = []
    const failed: Array<{ id: string, error: string }> = []

    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      if (result.status === 'fulfilled') {
        connected.push(result.value)
      }
      else {
        failed.push({
          id: enabled[i].id,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        })
      }
    }

    return { connected, failed }
  }

  getServerStatus(id: string): ServerStatus {
    return this.clientManager.isConnected(id) ? 'connected' : 'disconnected'
  }

  async aggregateTools(): Promise<Record<string, unknown>> {
    return this.clientManager.aggregateTools()
  }

  async shutdown(): Promise<void> {
    try {
      await this.clientManager.disconnectAll()
    }
    finally {
      this.store.close()
    }
  }
}
