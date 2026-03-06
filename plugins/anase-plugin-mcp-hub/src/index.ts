import type { InvocableEventContext } from '@moeru/eventa'
import type { ConnectEnabledResult, McpServerConfigInput, ServerStatus } from '@anase/mcp-hub'
import type { ContextInit } from '@anase/plugin-sdk/plugin'

import process from 'node:process'

import { defineInvokeEventa, defineInvokeHandler } from '@moeru/eventa'
import { McpHub } from '@anase/mcp-hub'
import { definePlugin } from '@anase/plugin-sdk/plugin'

// ---------------------------------------------------------------------------
// Protocol events — consumers import these to invoke MCP Hub operations.
// ---------------------------------------------------------------------------

export const mcpServersList = defineInvokeEventa<
  ReturnType<McpHub['listServers']>
>('airi:plugin:mcp-hub:servers:list')

export const mcpServersAdd = defineInvokeEventa<
  ReturnType<McpHub['addServer']>,
  McpServerConfigInput
>('airi:plugin:mcp-hub:servers:add')

export const mcpServersRemove = defineInvokeEventa<
  void,
  { id: string }
>('airi:plugin:mcp-hub:servers:remove')

export const mcpServersConnect = defineInvokeEventa<
  void,
  { id: string }
>('airi:plugin:mcp-hub:servers:connect')

export const mcpServersDisconnect = defineInvokeEventa<
  void,
  { id: string }
>('airi:plugin:mcp-hub:servers:disconnect')

export const mcpServersConnectEnabled = defineInvokeEventa<
  ConnectEnabledResult
>('airi:plugin:mcp-hub:servers:connect-enabled')

export const mcpServersStatus = defineInvokeEventa<
  ServerStatus,
  { id: string }
>('airi:plugin:mcp-hub:servers:status')

export const mcpToolsAggregate = defineInvokeEventa<
  Record<string, unknown>
>('airi:plugin:mcp-hub:tools:aggregate')

// ---------------------------------------------------------------------------
// Plugin definition
// ---------------------------------------------------------------------------

let hub: McpHub | null = null

export default definePlugin('anase-plugin-mcp-hub', '0.8.4', () => ({
  async init(_ctx: ContextInit): Promise<void | false> {
    const dbPath = process.env.ANASE_MCP_HUB_DB_PATH ?? './data/mcp-hub.db'
    hub = new McpHub(dbPath)
  },

  async setupModules({ channels }: ContextInit): Promise<void> {
    if (!hub) {
      throw new Error('McpHub not initialized — init() must succeed before setupModules()')
    }

    // ChannelHost is typed as EventContext<unknown, unknown> but the plugin-host
    // always provides EventContext<any, any> via createPluginContext at runtime.
    // Cast to satisfy defineInvokeHandler's InvocableEventContext constraint.
    const ctx = channels.host as InvocableEventContext<unknown, { raw?: unknown }>

    defineInvokeHandler(ctx, mcpServersList, async () => {
      return hub!.listServers()
    })

    defineInvokeHandler(ctx, mcpServersAdd, async (input) => {
      return hub!.addServer(input)
    })

    defineInvokeHandler(ctx, mcpServersRemove, async ({ id }) => {
      await hub!.removeServer(id)
    })

    defineInvokeHandler(ctx, mcpServersConnect, async ({ id }) => {
      await hub!.connectServer(id)
    })

    defineInvokeHandler(ctx, mcpServersDisconnect, async ({ id }) => {
      await hub!.disconnectServer(id)
    })

    defineInvokeHandler(ctx, mcpServersConnectEnabled, async () => {
      return await hub!.connectEnabled()
    })

    defineInvokeHandler(ctx, mcpServersStatus, async ({ id }) => {
      return hub!.getServerStatus(id)
    })

    defineInvokeHandler(ctx, mcpToolsAggregate, async () => {
      return await hub!.aggregateTools()
    })

    // Auto-connect enabled servers on plugin start
    const result = await hub.connectEnabled()
    if (result.failed.length > 0) {
      console.warn('[mcp-hub-plugin] Some servers failed to connect on startup', {
        failed: result.failed,
      })
    }
  },
}))
