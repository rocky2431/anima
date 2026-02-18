import type { HttpServerConfig, SseServerConfig, StdioServerConfig } from '../types'

import { describe, expect, it } from 'vitest'

import { createTransport } from '../transport-factory'

describe('createTransport', () => {
  const now = Date.now()

  it('creates stdio transport with command and args', () => {
    const config: StdioServerConfig = {
      id: 'test-id',
      name: 'test',
      transport: 'stdio',
      enabled: true,
      command: 'npx',
      args: ['-y', 'some-mcp-server'],
      createdAt: now,
      updatedAt: now,
    }

    const transport = createTransport(config)
    expect(transport).toBeDefined()
    expect(transport).toHaveProperty('start')
  })

  it('creates SSE transport config object', () => {
    const config: SseServerConfig = {
      id: 'test-id',
      name: 'test',
      transport: 'sse',
      enabled: true,
      url: 'https://test.example.com/sse',
      createdAt: now,
      updatedAt: now,
    }

    const transport = createTransport(config)
    expect(transport).toBeDefined()
    expect(transport).toHaveProperty('type', 'sse')
    expect(transport).toHaveProperty('url', 'https://test.example.com/sse')
  })

  it('creates SSE transport with headers', () => {
    const config: SseServerConfig = {
      id: 'test-id',
      name: 'test',
      transport: 'sse',
      enabled: true,
      url: 'https://test.example.com/sse',
      headers: { Authorization: 'Bearer test-token' },
      createdAt: now,
      updatedAt: now,
    }

    const transport = createTransport(config)
    expect(transport).toHaveProperty('headers')
    expect((transport as Record<string, unknown>).headers).toEqual({ Authorization: 'Bearer test-token' })
  })

  it('creates HTTP transport config object', () => {
    const config: HttpServerConfig = {
      id: 'test-id',
      name: 'test',
      transport: 'http',
      enabled: true,
      url: 'https://test.example.com/mcp',
      createdAt: now,
      updatedAt: now,
    }

    const transport = createTransport(config)
    expect(transport).toBeDefined()
    expect(transport).toHaveProperty('type', 'http')
    expect(transport).toHaveProperty('url', 'https://test.example.com/mcp')
  })

  it('creates HTTP transport with headers', () => {
    const config: HttpServerConfig = {
      id: 'test-id',
      name: 'test',
      transport: 'http',
      enabled: true,
      url: 'https://test.example.com/mcp',
      headers: { 'X-Api-Key': 'secret' },
      createdAt: now,
      updatedAt: now,
    }

    const transport = createTransport(config)
    expect((transport as Record<string, unknown>).headers).toEqual({ 'X-Api-Key': 'secret' })
  })
})
