import type { WhatsAppConfig } from '../../types.js'

import { describe, expect, it, vi } from 'vitest'

import { WhatsAppChannel } from '../../whatsapp/index.js'

// Test Double rationale: @whiskeysockets/baileys is an external third-party service
// requiring real WhatsApp credentials and a phone device for QR scan. Cannot be tested
// with real infrastructure in CI. We verify the integration contract by testing that
// WhatsAppChannel correctly delegates to baileys APIs.

describe('whatsAppChannel', () => {
  const config: WhatsAppConfig = {
    platform: 'whatsapp',
    authDir: '/tmp/wa-test-auth',
    rateLimitPerMinute: 10,
  }

  it('should have platform set to whatsapp', () => {
    const channel = new WhatsAppChannel(config)
    expect(channel.platform).toBe('whatsapp')
  })

  it('should start with disconnected status', () => {
    const channel = new WhatsAppChannel(config)
    expect(channel.status).toBe('disconnected')
  })

  it('should transition to connecting then connected on connect', async () => {
    const channel = new WhatsAppChannel(config, {
      createSocket: () => createMockBaileysSocket(),
    })

    const statuses: string[] = []
    channel.onStatusChange(s => statuses.push(s))

    await channel.connect()

    expect(statuses).toContain('connecting')
    expect(channel.status).toBe('connected')
  })

  it('should transition to disconnected on disconnect', async () => {
    const channel = new WhatsAppChannel(config, {
      createSocket: () => createMockBaileysSocket(),
    })

    await channel.connect()
    await channel.disconnect()

    expect(channel.status).toBe('disconnected')
  })

  it('should send text message via baileys socket', async () => {
    const sendMessageFn = vi.fn()
    const channel = new WhatsAppChannel(config, {
      createSocket: () => createMockBaileysSocket({ sendMessage: sendMessageFn }),
    })

    await channel.connect()
    await channel.sendMessage('12345678901@s.whatsapp.net', { text: 'Hello!' })

    expect(sendMessageFn).toHaveBeenCalledWith(
      '12345678901@s.whatsapp.net',
      { text: 'Hello!' },
    )
  })

  it('should receive messages and invoke handler', async () => {
    const mockSocket = createMockBaileysSocket()
    const channel = new WhatsAppChannel(config, {
      createSocket: () => mockSocket,
    })

    await channel.connect()

    const received: Array<{ text: string }> = []
    channel.onMessage((msg) => { received.push({ text: msg.text }) })

    mockSocket._emit('messages.upsert', {
      messages: [{
        key: { remoteJid: '12345678901@s.whatsapp.net', fromMe: false, id: 'msg-1' },
        message: { conversation: 'Hello from WhatsApp!' },
        messageTimestamp: Math.floor(Date.now() / 1000),
      }],
      type: 'notify',
    })

    expect(received).toHaveLength(1)
    expect(received[0].text).toBe('Hello from WhatsApp!')
  })

  it('should ignore messages from self', async () => {
    const mockSocket = createMockBaileysSocket()
    const channel = new WhatsAppChannel(config, {
      createSocket: () => mockSocket,
    })

    await channel.connect()

    const received: Array<{ text: string }> = []
    channel.onMessage((msg) => { received.push({ text: msg.text }) })

    mockSocket._emit('messages.upsert', {
      messages: [{
        key: { remoteJid: '12345678901@s.whatsapp.net', fromMe: true, id: 'msg-2' },
        message: { conversation: 'My own message' },
        messageTimestamp: Math.floor(Date.now() / 1000),
      }],
      type: 'notify',
    })

    expect(received).toHaveLength(0)
  })

  it('should respect rate limit', async () => {
    const sendMessageFn = vi.fn()
    const channel = new WhatsAppChannel(
      { ...config, rateLimitPerMinute: 2 },
      { createSocket: () => createMockBaileysSocket({ sendMessage: sendMessageFn }) },
    )

    await channel.connect()

    await channel.sendMessage('a@s.whatsapp.net', { text: '1' })
    await channel.sendMessage('b@s.whatsapp.net', { text: '2' })

    await expect(
      channel.sendMessage('c@s.whatsapp.net', { text: '3' }),
    ).rejects.toThrow(/rate limit/i)
  })

  it('should unsubscribe message handler', async () => {
    const mockSocket = createMockBaileysSocket()
    const channel = new WhatsAppChannel(config, {
      createSocket: () => mockSocket,
    })

    await channel.connect()

    const received: string[] = []
    const unsub = channel.onMessage((msg) => { received.push(msg.text) })
    unsub()

    mockSocket._emit('messages.upsert', {
      messages: [{
        key: { remoteJid: '12345678901@s.whatsapp.net', fromMe: false, id: 'msg-3' },
        message: { conversation: 'Should not be received' },
        messageTimestamp: Math.floor(Date.now() / 1000),
      }],
      type: 'notify',
    })

    expect(received).toHaveLength(0)
  })

  it('should throw when sending before connect', async () => {
    const channel = new WhatsAppChannel(config)

    await expect(
      channel.sendMessage('12345@s.whatsapp.net', { text: 'fail' }),
    ).rejects.toThrow(/sendMessage failed/i)
  })

  it('should throw when connecting without deps', async () => {
    const channel = new WhatsAppChannel(config)

    await expect(channel.connect()).rejects.toThrow(/requires createSocket/)
    expect(channel.status).toBe('error')
  })

  it('should set error status when connect fails', async () => {
    const channel = new WhatsAppChannel(config, {
      createSocket: () => { throw new Error('socket creation failed') },
    })

    await expect(channel.connect()).rejects.toThrow(/connect failed/)
    expect(channel.status).toBe('error')
  })

  it('should handle extendedTextMessage format', async () => {
    const mockSocket = createMockBaileysSocket()
    const channel = new WhatsAppChannel(config, {
      createSocket: () => mockSocket,
    })

    await channel.connect()

    const received: Array<{ text: string }> = []
    channel.onMessage((msg) => { received.push({ text: msg.text }) })

    mockSocket._emit('messages.upsert', {
      messages: [{
        key: { remoteJid: '12345678901@s.whatsapp.net', fromMe: false, id: 'msg-ext' },
        message: { extendedTextMessage: { text: 'Quoted reply text' } },
        messageTimestamp: Math.floor(Date.now() / 1000),
      }],
      type: 'notify',
    })

    expect(received).toHaveLength(1)
    expect(received[0].text).toBe('Quoted reply text')
  })

  it('should skip media-only messages with no text', async () => {
    const mockSocket = createMockBaileysSocket()
    const channel = new WhatsAppChannel(config, {
      createSocket: () => mockSocket,
    })

    await channel.connect()

    const received: Array<{ text: string }> = []
    channel.onMessage((msg) => { received.push({ text: msg.text }) })

    mockSocket._emit('messages.upsert', {
      messages: [{
        key: { remoteJid: '12345678901@s.whatsapp.net', fromMe: false, id: 'msg-media' },
        message: {},
        messageTimestamp: Math.floor(Date.now() / 1000),
      }],
      type: 'notify',
    })

    expect(received).toHaveLength(0)
  })
})

interface MockBaileysSocket {
  sendMessage: (...args: unknown[]) => Promise<void>
  end: (error?: Error) => void
  ev: {
    on: (event: string, handler: (...args: unknown[]) => void) => void
    off: (event: string, handler: (...args: unknown[]) => void) => void
  }
  _emit: (event: string, data: unknown) => void
}

function createMockBaileysSocket(overrides: Partial<{ sendMessage: (...args: unknown[]) => Promise<void> }> = {}): MockBaileysSocket {
  const handlers = new Map<string, Set<(...args: unknown[]) => void>>()

  return {
    sendMessage: overrides.sendMessage ?? (async () => {}),
    end() {},
    ev: {
      on(event: string, handler: (...args: unknown[]) => void) {
        if (!handlers.has(event))
          handlers.set(event, new Set())
        handlers.get(event)!.add(handler)
      },
      off(event: string, handler: (...args: unknown[]) => void) {
        handlers.get(event)?.delete(handler)
      },
    },
    _emit(event: string, data: unknown) {
      for (const handler of handlers.get(event) ?? []) {
        handler(data)
      }
    },
  }
}
