import type { InvocableEventContext } from '@moeru/eventa'
import type { AnimaUserContext, MemoryResult } from '@proj-airi/mcp-hub'
import type { ContextInit } from '@proj-airi/plugin-sdk/plugin'

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { defineInvoke, defineInvokeEventa, defineInvokeHandler } from '@moeru/eventa'
import { definePlugin } from '@proj-airi/plugin-sdk/plugin'
import { z } from 'zod/v4'

// ---------------------------------------------------------------------------
// Provider events — other plugins (e.g. context-engine) register handlers
// for these to supply real memory/context data. Without handlers, the
// MCP server tools return empty/default responses gracefully.
// ---------------------------------------------------------------------------

export const animaMemorySearch = defineInvokeEventa<
  MemoryResult[],
  { query: string, limit: number }
>('airi:plugin:anima-mcp-server:memory:search')

export const animaMemoryRecent = defineInvokeEventa<
  MemoryResult[],
  { limit: number }
>('airi:plugin:anima-mcp-server:memory:recent')

export const animaDailySummary = defineInvokeEventa<
  string,
  { date?: string }
>('airi:plugin:anima-mcp-server:context:daily-summary')

export const animaGetUserContext = defineInvokeEventa<
  AnimaUserContext
>('airi:plugin:anima-mcp-server:context:user')

// ---------------------------------------------------------------------------
// Consumer event — retrieve the created McpServer instance so the app layer
// can connect it to a transport (SSE, stdio, etc.)
// ---------------------------------------------------------------------------

export const animaMcpServerGet = defineInvokeEventa<
  McpServer | null
>('airi:plugin:anima-mcp-server:instance:get')

// ---------------------------------------------------------------------------
// Plugin definition
// ---------------------------------------------------------------------------

let server: McpServer | null = null

export default definePlugin('airi-plugin-anima-mcp-server', '0.8.4', () => ({
  async init(_ctx: ContextInit): Promise<void | false> {
    // Server creation deferred to setupModules where invoke access is available
  },

  async setupModules({ channels }: ContextInit): Promise<void> {
    const ctx = channels.host as InvocableEventContext<unknown, { raw?: unknown }>

    const invokeMemorySearch = defineInvoke(ctx, animaMemorySearch)
    const invokeMemoryRecent = defineInvoke(ctx, animaMemoryRecent)
    const invokeDailySummary = defineInvoke(ctx, animaDailySummary)
    const invokeUserCtx = defineInvoke(ctx, animaGetUserContext)

    server = new McpServer({ name: 'anima', version: '1.0.0' })

    server.registerTool(
      'search_memories',
      {
        description: 'Search through Anima\'s stored memories by keyword query',
        inputSchema: {
          query: z.string().describe('Search query to match against memory content'),
          limit: z.number().optional().describe('Maximum number of results to return (default: 10)'),
        },
      },
      async ({ query, limit }: { query: string, limit?: number }) => {
        try {
          const results = await invokeMemorySearch({ query, limit: limit ?? 10 })
          return { content: [{ type: 'text' as const, text: JSON.stringify(results) }] }
        }
        catch {
          return { content: [{ type: 'text' as const, text: '[]' }] }
        }
      },
    )

    server.registerTool(
      'get_daily_summary',
      {
        description: 'Get a daily activity summary for the user',
        inputSchema: {
          date: z.string().optional().describe('Date in YYYY-MM-DD format (defaults to today)'),
        },
      },
      async ({ date }: { date?: string }) => {
        try {
          const summary = await invokeDailySummary({ date })
          return { content: [{ type: 'text' as const, text: summary }] }
        }
        catch {
          return { content: [{ type: 'text' as const, text: 'No summary available.' }] }
        }
      },
    )

    server.registerResource(
      'user-context',
      'anima://user-context',
      {
        description: 'Current user context snapshot including intimacy, profile facts, and relationships',
        mimeType: 'application/json',
      },
      async (uri: URL) => {
        try {
          const context = await invokeUserCtx()
          return {
            contents: [{
              uri: uri.href,
              text: JSON.stringify(context),
              mimeType: 'application/json',
            }],
          }
        }
        catch {
          return {
            contents: [{
              uri: uri.href,
              text: JSON.stringify({ error: 'User context not available — context-engine not connected' }),
              mimeType: 'application/json',
            }],
          }
        }
      },
    )

    server.registerResource(
      'memories',
      'anima://memories',
      {
        description: 'Recent memories stored by Anima',
        mimeType: 'application/json',
      },
      async (uri: URL) => {
        try {
          const memories = await invokeMemoryRecent({ limit: 50 })
          return {
            contents: [{
              uri: uri.href,
              text: JSON.stringify(memories),
              mimeType: 'application/json',
            }],
          }
        }
        catch {
          return {
            contents: [{
              uri: uri.href,
              text: '[]',
              mimeType: 'application/json',
            }],
          }
        }
      },
    )

    // Expose the server instance so the app layer can connect it to a transport
    defineInvokeHandler(ctx, animaMcpServerGet, async () => {
      return server
    })
  },
}))
