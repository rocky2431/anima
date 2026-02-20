import { describe, expect, it } from 'vitest'

import { getRecommendedServers } from '../recommended-servers'
import { VALID_TRANSPORTS } from '../types'

describe('recommendedServers', () => {
  it('returns a non-empty list of recommended servers', () => {
    const servers = getRecommendedServers()
    expect(servers.length).toBeGreaterThan(0)
  })

  it('each server has required fields', () => {
    for (const server of getRecommendedServers()) {
      expect(server.id).toBeTruthy()
      expect(server.name).toBeTruthy()
      expect(server.description).toBeTruthy()
      expect(VALID_TRANSPORTS).toContain(server.transport)
      expect(server.category).toBeTruthy()
    }
  })

  it('servers have unique IDs', () => {
    const servers = getRecommendedServers()
    const ids = servers.map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('stdio servers have valid commands', () => {
    const stdioServers = getRecommendedServers().filter(s => s.transport === 'stdio')
    for (const server of stdioServers) {
      expect(server.command).toBeTruthy()
    }
  })

  it('http/sse servers have valid URLs', () => {
    const urlServers = getRecommendedServers().filter(
      s => s.transport === 'http' || s.transport === 'sse',
    )
    for (const server of urlServers) {
      expect(server.url).toBeTruthy()
      expect(server.url).toMatch(/^https?:\/\//)
    }
  })

  it('each server has a category', () => {
    for (const server of getRecommendedServers()) {
      expect(server.category).toBeTruthy()
    }
  })

  it('includes at least one official server', () => {
    const officialServers = getRecommendedServers().filter(s => s.official)
    expect(officialServers.length).toBeGreaterThan(0)
  })
})
