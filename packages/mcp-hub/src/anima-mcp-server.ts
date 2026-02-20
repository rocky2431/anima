import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod/v4'

/**
 * A memory search result item.
 */
export interface MemoryResult {
  content: string
  importance: number
  category: string
  sourceDate: string
}

/**
 * Snapshot of the user's current context.
 */
export interface AnimaUserContext {
  intimacyLevel: number
  profileFacts: string[]
  relationships: Array<{ name: string, type: string }>
  recentTopics: string[]
}

/**
 * Interface for accessing memory data.
 * Implemented by context-engine's DocumentStore/VectorStore at the app wiring level.
 */
export interface AnimaMemoryAccess {
  searchMemories: (query: string, limit?: number) => MemoryResult[]
  getRecentMemories: (limit: number) => MemoryResult[]
}

/**
 * Interface for accessing context data.
 * Implemented by context-engine's ReportGenerator/ActivityMonitor at the app wiring level.
 */
export interface AnimaContextAccess {
  getDailySummary: (date?: string) => string
  getUserContext: () => AnimaUserContext
}

export interface AnimaMcpServerDeps {
  memoryAccess: AnimaMemoryAccess
  contextAccess: AnimaContextAccess
}

/**
 * Creates an MCP Server that exposes Anima's memory and context capabilities.
 * External tools (Claude Desktop, etc.) can connect to this server to query memories
 * and context from the running Anima instance.
 */
export function createAnimaMcpServer(deps: AnimaMcpServerDeps): McpServer {
  const { memoryAccess, contextAccess } = deps

  const server = new McpServer({
    name: 'anima',
    version: '1.0.0',
  })

  server.registerTool(
    'search_memories',
    {
      description: 'Search through Anima\'s stored memories by keyword query',
      inputSchema: {
        query: z.string().describe('Search query to match against memory content'),
        limit: z.number().optional().describe('Maximum number of results to return (default: 10)'),
      },
    },
    async ({ query, limit }) => {
      try {
        const results = memoryAccess.searchMemories(query, limit ?? 10)
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(results) }],
        }
      }
      catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Failed to search memories: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        }
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
    async ({ date }) => {
      try {
        const summary = contextAccess.getDailySummary(date)
        return {
          content: [{ type: 'text' as const, text: summary }],
        }
      }
      catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Failed to get daily summary: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        }
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
    async (uri) => {
      try {
        const context = contextAccess.getUserContext()
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify(context),
            mimeType: 'application/json',
          }],
        }
      }
      catch (error) {
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify({ error: `Failed to get user context: ${error instanceof Error ? error.message : String(error)}` }),
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
    async (uri) => {
      try {
        const memories = memoryAccess.getRecentMemories(50)
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify(memories),
            mimeType: 'application/json',
          }],
        }
      }
      catch (error) {
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify({ error: `Failed to get recent memories: ${error instanceof Error ? error.message : String(error)}` }),
            mimeType: 'application/json',
          }],
        }
      }
    },
  )

  return server
}
