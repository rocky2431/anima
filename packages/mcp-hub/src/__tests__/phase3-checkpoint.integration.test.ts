import type { AnimaContextAccess, AnimaMcpServerDeps, AnimaMemoryAccess, AnimaUserContext, MemoryResult } from '../anima-mcp-server'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, it } from 'vitest'

import { createAnimaMcpServer } from '../anima-mcp-server'

// Test Double rationale: Memory/Context access are internal application boundaries
// that require a running Anima instance with real DB. We verify the MCP protocol
// layer (tool registration, invocation, resource reading) with stub data.

function makeMemoryResult(overrides: Partial<MemoryResult> = {}): MemoryResult {
  return {
    content: 'User prefers dark mode',
    importance: 8,
    category: 'preference',
    sourceDate: '2026-02-20',
    ...overrides,
  }
}

function createStubDeps(overrides?: Partial<AnimaMcpServerDeps>): AnimaMcpServerDeps {
  const memories: MemoryResult[] = [
    makeMemoryResult({ content: 'User loves TypeScript', category: 'preference' }),
    makeMemoryResult({ content: 'Had coffee with Alice on Feb 10', category: 'event' }),
    makeMemoryResult({ content: 'User goes to gym every Monday', category: 'habit' }),
  ]

  const memoryAccess: AnimaMemoryAccess = {
    searchMemories(query: string, limit?: number): MemoryResult[] {
      return memories
        .filter(m => m.content.toLowerCase().includes(query.toLowerCase()))
        .slice(0, limit ?? 10)
    },
    getRecentMemories(limit: number): MemoryResult[] {
      return memories.slice(0, limit)
    },
    ...overrides?.memoryAccess,
  }

  const contextAccess: AnimaContextAccess = {
    getDailySummary(date?: string): string {
      return `Summary for ${date ?? 'today'}: Worked on TypeScript project, attended team meeting.`
    },
    getUserContext(): AnimaUserContext {
      return {
        intimacyLevel: 75,
        profileFacts: ['prefers dark mode', 'loves TypeScript'],
        relationships: [{ name: 'Alice', type: 'colleague' }],
        recentTopics: ['TypeScript', 'AI development'],
      }
    },
    ...overrides?.contextAccess,
  }

  return { memoryAccess, contextAccess }
}

describe('phase 3 checkpoint: Anima MCP Server integration', () => {
  async function createConnectedPair(deps: AnimaMcpServerDeps) {
    const server = createAnimaMcpServer(deps)
    const client = new Client({ name: 'test-client', version: '1.0.0' })

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await Promise.all([
      client.connect(clientTransport),
      server.connect(serverTransport),
    ])

    return { client, server, cleanup: async () => {
      await client.close()
      await server.close()
    } }
  }

  describe('tool: search_memories', () => {
    it('searches memories by keyword and returns results', async () => {
      const deps = createStubDeps()
      const { client, cleanup } = await createConnectedPair(deps)

      try {
        const result = await client.callTool({
          name: 'search_memories',
          arguments: { query: 'TypeScript', limit: 5 },
        })

        expect(result.content).toBeDefined()
        expect(Array.isArray(result.content)).toBe(true)

        const textContent = result.content as Array<{ type: string, text: string }>
        expect(textContent[0].type).toBe('text')

        const parsed = JSON.parse(textContent[0].text)
        expect(Array.isArray(parsed)).toBe(true)
        expect(parsed.length).toBeGreaterThan(0)
        expect(parsed[0]).toHaveProperty('content')
        expect(parsed[0].content).toContain('TypeScript')
      }
      finally {
        await cleanup()
      }
    })

    it('returns empty results for non-matching query', async () => {
      const deps = createStubDeps()
      const { client, cleanup } = await createConnectedPair(deps)

      try {
        const result = await client.callTool({
          name: 'search_memories',
          arguments: { query: 'nonexistent_xyz_123' },
        })

        const textContent = result.content as Array<{ type: string, text: string }>
        const parsed = JSON.parse(textContent[0].text)
        expect(parsed).toEqual([])
      }
      finally {
        await cleanup()
      }
    })

    it('handles search errors gracefully', async () => {
      const deps = createStubDeps({
        memoryAccess: {
          searchMemories() { throw new Error('DB connection lost') },
          getRecentMemories() { return [] },
        },
      })
      const { client, cleanup } = await createConnectedPair(deps)

      try {
        const result = await client.callTool({
          name: 'search_memories',
          arguments: { query: 'test' },
        })

        expect(result.isError).toBe(true)
        const textContent = result.content as Array<{ type: string, text: string }>
        expect(textContent[0].text).toContain('Failed to search memories')
      }
      finally {
        await cleanup()
      }
    })
  })

  describe('tool: get_daily_summary', () => {
    it('returns daily summary for a specific date', async () => {
      const deps = createStubDeps()
      const { client, cleanup } = await createConnectedPair(deps)

      try {
        const result = await client.callTool({
          name: 'get_daily_summary',
          arguments: { date: '2026-02-20' },
        })

        const textContent = result.content as Array<{ type: string, text: string }>
        expect(textContent[0].text).toContain('2026-02-20')
        expect(textContent[0].text).toContain('TypeScript')
      }
      finally {
        await cleanup()
      }
    })

    it('returns summary for today when no date specified', async () => {
      const deps = createStubDeps()
      const { client, cleanup } = await createConnectedPair(deps)

      try {
        const result = await client.callTool({
          name: 'get_daily_summary',
          arguments: {},
        })

        const textContent = result.content as Array<{ type: string, text: string }>
        expect(textContent[0].text).toContain('today')
      }
      finally {
        await cleanup()
      }
    })
  })

  describe('tool: get_daily_summary error handling', () => {
    it('handles getDailySummary errors gracefully', async () => {
      const deps = createStubDeps({
        contextAccess: {
          getDailySummary() { throw new Error('Summary generation failed') },
          getUserContext() {
            return { intimacyLevel: 0, profileFacts: [], relationships: [], recentTopics: [] }
          },
        },
      })
      const { client, cleanup } = await createConnectedPair(deps)

      try {
        const result = await client.callTool({
          name: 'get_daily_summary',
          arguments: { date: '2026-02-20' },
        })

        expect(result.isError).toBe(true)
        const textContent = result.content as Array<{ type: string, text: string }>
        expect(textContent[0].text).toContain('Failed to get daily summary')
      }
      finally {
        await cleanup()
      }
    })
  })

  describe('resource: user-context error handling', () => {
    it('returns error JSON when getUserContext fails', async () => {
      const deps = createStubDeps({
        contextAccess: {
          getDailySummary() { return 'ok' },
          getUserContext() { throw new Error('Context unavailable') },
        },
      })
      const { client, cleanup } = await createConnectedPair(deps)

      try {
        const result = await client.readResource({
          uri: 'anima://user-context',
        })

        expect(result.contents).toHaveLength(1)
        const content = result.contents[0]
        const text = 'text' in content ? content.text : ''
        const parsed = JSON.parse(text as string)
        expect(parsed.error).toContain('Failed to get user context')
      }
      finally {
        await cleanup()
      }
    })
  })

  describe('resource: memories error handling', () => {
    it('returns error JSON when getRecentMemories fails', async () => {
      const deps = createStubDeps({
        memoryAccess: {
          searchMemories() { return [] },
          getRecentMemories() { throw new Error('DB read failed') },
        },
      })
      const { client, cleanup } = await createConnectedPair(deps)

      try {
        const result = await client.readResource({
          uri: 'anima://memories',
        })

        expect(result.contents).toHaveLength(1)
        const content = result.contents[0]
        const text = 'text' in content ? content.text : ''
        const parsed = JSON.parse(text as string)
        expect(parsed.error).toContain('Failed to get recent memories')
      }
      finally {
        await cleanup()
      }
    })
  })

  describe('resource: user-context', () => {
    it('exposes user context as JSON resource', async () => {
      const deps = createStubDeps()
      const { client, cleanup } = await createConnectedPair(deps)

      try {
        const result = await client.readResource({
          uri: 'anima://user-context',
        })

        expect(result.contents).toHaveLength(1)
        expect(result.contents[0].mimeType).toBe('application/json')

        const content = result.contents[0]
        const text = 'text' in content ? content.text : ''
        const context: AnimaUserContext = JSON.parse(text as string)
        expect(context.intimacyLevel).toBe(75)
        expect(context.profileFacts).toContain('prefers dark mode')
        expect(context.relationships).toHaveLength(1)
        expect(context.relationships[0].name).toBe('Alice')
        expect(context.recentTopics).toContain('TypeScript')
      }
      finally {
        await cleanup()
      }
    })
  })

  describe('resource: memories', () => {
    it('exposes recent memories as JSON resource', async () => {
      const deps = createStubDeps()
      const { client, cleanup } = await createConnectedPair(deps)

      try {
        const result = await client.readResource({
          uri: 'anima://memories',
        })

        expect(result.contents).toHaveLength(1)
        expect(result.contents[0].mimeType).toBe('application/json')

        const memContent = result.contents[0]
        const memText = 'text' in memContent ? memContent.text : ''
        const memories: MemoryResult[] = JSON.parse(memText as string)
        expect(Array.isArray(memories)).toBe(true)
        expect(memories.length).toBe(3) // 3 stub memories
        expect(memories[0]).toHaveProperty('content')
        expect(memories[0]).toHaveProperty('importance')
        expect(memories[0]).toHaveProperty('category')
      }
      finally {
        await cleanup()
      }
    })
  })

  describe('tool listing', () => {
    it('lists all registered tools', async () => {
      const deps = createStubDeps()
      const { client, cleanup } = await createConnectedPair(deps)

      try {
        const tools = await client.listTools()
        const toolNames = tools.tools.map(t => t.name)

        expect(toolNames).toContain('search_memories')
        expect(toolNames).toContain('get_daily_summary')
      }
      finally {
        await cleanup()
      }
    })
  })
})
