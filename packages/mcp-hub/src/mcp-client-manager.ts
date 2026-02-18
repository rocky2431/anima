import type { McpTransport } from './transport-factory'
import type { McpServerConfig } from './types'

import { createMCPClient } from '@ai-sdk/mcp'

import { createTransport } from './transport-factory'

type McpClient = Awaited<ReturnType<typeof createMCPClient>>

export class McpClientManager {
  private clients: Map<string, McpClient> = new Map()

  async connect(config: McpServerConfig): Promise<void> {
    if (this.clients.has(config.id)) {
      throw new Error(`Server already connected: ${config.id}`)
    }

    const transport = createTransport(config)
    try {
      const client = await createMCPClient({
        transport: transport as McpTransport,
      })
      this.clients.set(config.id, client)
    }
    catch (err) {
      const closeable = transport as { close?: () => Promise<void> }
      if (typeof closeable.close === 'function') {
        try { await closeable.close() }
        catch (cleanupErr) {
          console.warn(`Best-effort transport cleanup failed for server ${config.id}`, { cause: cleanupErr })
        }
      }
      throw new Error(`Failed to connect MCP server ${config.id}`, { cause: err })
    }
  }

  async disconnect(serverId: string): Promise<void> {
    const client = this.clients.get(serverId)
    if (!client) {
      return
    }

    await client.close()
    this.clients.delete(serverId)
  }

  async disconnectAll(): Promise<void> {
    const ids = Array.from(this.clients.keys())
    const results = await Promise.allSettled(ids.map(id => this.disconnect(id)))

    const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    if (failures.length > 0) {
      const errors = failures.map(f => f.reason)
      this.clients.clear()
      throw new AggregateError(errors, `Failed to disconnect ${failures.length} server(s)`)
    }
  }

  isConnected(serverId: string): boolean {
    return this.clients.has(serverId)
  }

  getConnectedIds(): string[] {
    return Array.from(this.clients.keys())
  }

  async getTools(serverId: string): Promise<Record<string, unknown>> {
    const client = this.clients.get(serverId)
    if (!client) {
      throw new Error(`Server not connected: ${serverId}`)
    }

    return await client.tools()
  }

  async aggregateTools(): Promise<Record<string, unknown>> {
    const allTools: Record<string, unknown> = {}
    // Track which server originally registered each short tool name
    const toolOrigin: Map<string, string> = new Map()

    for (const [serverId, client] of this.clients) {
      let tools: Record<string, unknown>
      try {
        tools = await client.tools()
      }
      catch (err) {
        console.warn(`Failed to get tools from server ${serverId}`, { cause: err })
        continue
      }

      for (const [toolName, toolDef] of Object.entries(tools)) {
        if (toolName in allTools) {
          // Collision: namespace both the original and the new tool
          const originalServerId = toolOrigin.get(toolName)
          if (originalServerId) {
            // Move the first tool to its namespaced key
            allTools[`${originalServerId}__${toolName}`] = allTools[toolName]
            delete allTools[toolName]
            toolOrigin.delete(toolName)
          }
          allTools[`${serverId}__${toolName}`] = toolDef
        }
        else {
          allTools[toolName] = toolDef
          toolOrigin.set(toolName, serverId)
        }
      }
    }

    return allTools
  }
}
