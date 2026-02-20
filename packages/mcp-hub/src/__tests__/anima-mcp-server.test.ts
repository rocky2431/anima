import type { AnimaContextAccess, AnimaMemoryAccess } from '../anima-mcp-server'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createAnimaMcpServer } from '../anima-mcp-server'

// Test Double rationale: AnimaMemoryAccess and AnimaContextAccess are dependency-injected
// interfaces at the imperative shell boundary. Test implementations use static seeded data
// to validate the MCP protocol adapter layer independently of the storage layer
// (DocumentStore/VectorStore from context-engine, which is a separate package).

const SEED_MEMORIES = [
  { content: 'User likes coding in TypeScript', importance: 8, category: 'preference', sourceDate: '2026-02-18' },
  { content: 'User had a meeting about AI project', importance: 7, category: 'event', sourceDate: '2026-02-19' },
  { content: 'User prefers dark mode in all editors', importance: 6, category: 'preference', sourceDate: '2026-02-17' },
  { content: 'User is learning Rust programming', importance: 7, category: 'goal', sourceDate: '2026-02-20' },
]

const testMemoryAccess: AnimaMemoryAccess = {
  searchMemories(query: string, limit = 10) {
    return SEED_MEMORIES
      .filter(m => m.content.toLowerCase().includes(query.toLowerCase()))
      .slice(0, limit)
  },
  getRecentMemories(limit: number) {
    return SEED_MEMORIES.slice(0, limit)
  },
}

const testContextAccess: AnimaContextAccess = {
  getDailySummary() {
    return 'Today you spent most of the time coding. Had 2 meetings and reviewed 3 PRs.'
  },
  getUserContext() {
    return {
      intimacyLevel: 42,
      profileFacts: ['Prefers TypeScript', 'Works on AI projects'],
      relationships: [{ name: 'Alice', type: 'colleague' }],
      recentTopics: ['TypeScript', 'MCP protocol'],
    }
  },
}

describe('animaMcpServer', () => {
  let client: Client
  let closeServer: () => Promise<void>

  beforeEach(async () => {
    const server = createAnimaMcpServer({
      memoryAccess: testMemoryAccess,
      contextAccess: testContextAccess,
    })

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await server.connect(serverTransport)

    client = new Client({ name: 'test-client', version: '1.0.0' })
    await client.connect(clientTransport)
    closeServer = () => server.close()
  })

  afterEach(async () => {
    await client.close()
    await closeServer()
  })

  describe('tool registration', () => {
    it('lists search_memories and get_daily_summary tools', async () => {
      const { tools } = await client.listTools()
      const toolNames = tools.map(t => t.name)

      expect(toolNames).toContain('search_memories')
      expect(toolNames).toContain('get_daily_summary')
    })

    it('search_memories has a query parameter in its input schema', async () => {
      const { tools } = await client.listTools()
      const searchTool = tools.find(t => t.name === 'search_memories')

      expect(searchTool).toBeDefined()
      expect(searchTool!.inputSchema).toBeDefined()
      expect(searchTool!.inputSchema.properties).toHaveProperty('query')
    })
  })

  describe('search_memories tool', () => {
    it('returns matching memories for a query', async () => {
      const result = await client.callTool({
        name: 'search_memories',
        arguments: { query: 'TypeScript' },
      })

      expect(result.content).toBeDefined()
      const textContent = (result.content as Array<{ type: string, text: string }>)[0]
      expect(textContent.type).toBe('text')

      const parsed = JSON.parse(textContent.text)
      expect(Array.isArray(parsed)).toBe(true)
      expect(parsed.length).toBeGreaterThan(0)
      expect(parsed[0].content).toContain('TypeScript')
    })

    it('returns empty array for non-matching query', async () => {
      const result = await client.callTool({
        name: 'search_memories',
        arguments: { query: 'nonexistent_xyz_12345' },
      })

      const parsed = JSON.parse(
        (result.content as Array<{ type: string, text: string }>)[0].text,
      )
      expect(parsed).toEqual([])
    })

    it('respects limit parameter', async () => {
      const result = await client.callTool({
        name: 'search_memories',
        arguments: { query: 'User', limit: 2 },
      })

      const parsed = JSON.parse(
        (result.content as Array<{ type: string, text: string }>)[0].text,
      )
      expect(parsed.length).toBeLessThanOrEqual(2)
    })
  })

  describe('get_daily_summary tool', () => {
    it('returns summary text', async () => {
      const result = await client.callTool({
        name: 'get_daily_summary',
        arguments: {},
      })

      const textContent = (result.content as Array<{ type: string, text: string }>)[0]
      expect(textContent.type).toBe('text')
      expect(textContent.text.length).toBeGreaterThan(0)
      expect(textContent.text).toContain('coding')
    })

    it('accepts optional date parameter', async () => {
      const result = await client.callTool({
        name: 'get_daily_summary',
        arguments: { date: '2026-02-19' },
      })

      const textContent = (result.content as Array<{ type: string, text: string }>)[0]
      expect(textContent.type).toBe('text')
      expect(textContent.text.length).toBeGreaterThan(0)
    })
  })

  describe('resource registration', () => {
    it('lists user-context and memories resources', async () => {
      const { resources } = await client.listResources()
      const names = resources.map(r => r.name)

      expect(names).toContain('user-context')
      expect(names).toContain('memories')
    })
  })

  describe('user-context resource', () => {
    it('returns valid context snapshot with expected fields', async () => {
      const { contents } = await client.readResource({ uri: 'anima://user-context' })

      expect(contents.length).toBeGreaterThan(0)
      const content = contents[0] as { uri: string, text: string }
      const parsed = JSON.parse(content.text)

      expect(parsed).toHaveProperty('intimacyLevel')
      expect(parsed.intimacyLevel).toBe(42)
      expect(parsed).toHaveProperty('profileFacts')
      expect(parsed.profileFacts).toContain('Prefers TypeScript')
      expect(parsed).toHaveProperty('relationships')
      expect(parsed.relationships[0].name).toBe('Alice')
      expect(parsed).toHaveProperty('recentTopics')
    })
  })

  describe('memories resource', () => {
    it('returns recent memories list', async () => {
      const { contents } = await client.readResource({ uri: 'anima://memories' })

      expect(contents.length).toBeGreaterThan(0)
      const content = contents[0] as { uri: string, text: string }
      const parsed = JSON.parse(content.text)

      expect(Array.isArray(parsed)).toBe(true)
      expect(parsed.length).toBeGreaterThan(0)
      expect(parsed[0]).toHaveProperty('content')
      expect(parsed[0]).toHaveProperty('importance')
      expect(parsed[0]).toHaveProperty('category')
      expect(parsed[0]).toHaveProperty('sourceDate')
    })
  })

  describe('error handling', () => {
    it('returns isError response when search_memories throws', async () => {
      // Disconnect the clean client/server and create a new pair with a failing dep
      await client.close()
      await closeServer()

      const failingMemoryAccess: AnimaMemoryAccess = {
        searchMemories() { throw new Error('DB connection lost') },
        getRecentMemories() { return [] },
      }
      const failServer = createAnimaMcpServer({
        memoryAccess: failingMemoryAccess,
        contextAccess: testContextAccess,
      })

      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
      await failServer.connect(serverTransport)
      const failClient = new Client({ name: 'test-fail', version: '1.0.0' })
      await failClient.connect(clientTransport)

      const result = await failClient.callTool({ name: 'search_memories', arguments: { query: 'test' } })
      expect(result.isError).toBe(true)
      expect(result.content).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ text: expect.stringContaining('DB connection lost') }),
        ]),
      )

      await failClient.close()
      await failServer.close()
    })

    it('returns isError response when get_daily_summary throws', async () => {
      await client.close()
      await closeServer()

      const failingContextAccess: AnimaContextAccess = {
        getDailySummary() { throw new Error('Report generator unavailable') },
        getUserContext() { return testContextAccess.getUserContext() },
      }
      const failServer = createAnimaMcpServer({
        memoryAccess: testMemoryAccess,
        contextAccess: failingContextAccess,
      })

      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
      await failServer.connect(serverTransport)
      const failClient = new Client({ name: 'test-fail', version: '1.0.0' })
      await failClient.connect(clientTransport)

      const result = await failClient.callTool({ name: 'get_daily_summary', arguments: {} })
      expect(result.isError).toBe(true)
      expect(result.content).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ text: expect.stringContaining('Report generator unavailable') }),
        ]),
      )

      await failClient.close()
      await failServer.close()
    })

    it('returns error JSON when user-context resource throws', async () => {
      await client.close()
      await closeServer()

      const failingContextAccess: AnimaContextAccess = {
        getDailySummary() { return '' },
        getUserContext() { throw new Error('Context engine not initialized') },
      }
      const failServer = createAnimaMcpServer({
        memoryAccess: testMemoryAccess,
        contextAccess: failingContextAccess,
      })

      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
      await failServer.connect(serverTransport)
      const failClient = new Client({ name: 'test-fail', version: '1.0.0' })
      await failClient.connect(clientTransport)

      const { contents } = await failClient.readResource({ uri: 'anima://user-context' })
      const content = contents[0] as { uri: string, text: string }
      const parsed = JSON.parse(content.text)
      expect(parsed).toHaveProperty('error')
      expect(parsed.error).toContain('Context engine not initialized')

      await failClient.close()
      await failServer.close()
    })
  })
})
