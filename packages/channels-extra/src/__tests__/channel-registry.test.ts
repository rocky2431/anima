import type { Channel, ChannelConfig, IncomingMessage, MessageContent, MessageHandler } from '../types.js'

import { describe, expect, it } from 'vitest'

import { ChannelRegistry } from '../channel-registry.js'

function createStubChannel(platform: 'whatsapp' | 'slack', overrides: Partial<Channel> = {}): Channel & { _triggerMessage: (msg: IncomingMessage) => void } {
  let _status: Channel['status'] = 'disconnected'
  const handlers: MessageHandler[] = []

  return {
    platform,
    get status() { return _status },
    async connect() { _status = 'connected' },
    async disconnect() { _status = 'disconnected' },
    async sendMessage(_target: string, _content: MessageContent) {},
    onMessage(handler: MessageHandler) {
      handlers.push(handler)
      return () => {
        const idx = handlers.indexOf(handler)
        if (idx >= 0)
          handlers.splice(idx, 1)
      }
    },
    _triggerMessage(msg: IncomingMessage) {
      for (const handler of handlers) {
        handler(msg)
      }
    },
    ...overrides,
  }
}

function createTestMessage(platform: 'whatsapp' | 'slack'): IncomingMessage {
  return {
    id: 'test-msg-1',
    platform,
    channelId: 'test-channel',
    senderId: 'test-sender',
    text: 'Hello from test',
    timestamp: new Date(),
  }
}

describe('channelRegistry', () => {
  it('should register a channel', () => {
    const registry = new ChannelRegistry()
    const channel = createStubChannel('whatsapp')
    const config: ChannelConfig = { platform: 'whatsapp', authDir: '/tmp/wa-auth' }

    registry.register(channel, config)

    expect(registry.listAll()).toHaveLength(1)
  })

  it('should retrieve channel by platform', () => {
    const registry = new ChannelRegistry()
    const wa = createStubChannel('whatsapp')
    const slack = createStubChannel('slack')

    registry.register(wa, { platform: 'whatsapp', authDir: '/tmp/wa-auth' })
    registry.register(slack, { platform: 'slack', botToken: process.env.SLACK_BOT_TOKEN ?? 'test-bot-token', appToken: process.env.SLACK_APP_TOKEN ?? 'test-app-token' })

    expect(registry.getByPlatform('whatsapp')?.channel.platform).toBe('whatsapp')
    expect(registry.getByPlatform('slack')?.channel.platform).toBe('slack')
  })

  it('should return undefined for unregistered platform', () => {
    const registry = new ChannelRegistry()
    expect(registry.getByPlatform('whatsapp')).toBeUndefined()
  })

  it('should unregister a channel', () => {
    const registry = new ChannelRegistry()
    const channel = createStubChannel('whatsapp')

    registry.register(channel, { platform: 'whatsapp', authDir: '/tmp/wa-auth' })
    registry.unregister('whatsapp')

    expect(registry.listAll()).toHaveLength(0)
    expect(registry.getByPlatform('whatsapp')).toBeUndefined()
  })

  it('should connect all registered channels', async () => {
    const registry = new ChannelRegistry()
    const wa = createStubChannel('whatsapp')
    const slack = createStubChannel('slack')

    registry.register(wa, { platform: 'whatsapp', authDir: '/tmp/wa-auth' })
    registry.register(slack, { platform: 'slack', botToken: process.env.SLACK_BOT_TOKEN ?? 'test-bot-token', appToken: process.env.SLACK_APP_TOKEN ?? 'test-app-token' })

    await registry.connectAll()

    expect(wa.status).toBe('connected')
    expect(slack.status).toBe('connected')
  })

  it('should disconnect all registered channels', async () => {
    const registry = new ChannelRegistry()
    const wa = createStubChannel('whatsapp')
    const slack = createStubChannel('slack')

    registry.register(wa, { platform: 'whatsapp', authDir: '/tmp/wa-auth' })
    registry.register(slack, { platform: 'slack', botToken: process.env.SLACK_BOT_TOKEN ?? 'test-bot-token', appToken: process.env.SLACK_APP_TOKEN ?? 'test-app-token' })

    await registry.connectAll()
    await registry.disconnectAll()

    expect(wa.status).toBe('disconnected')
    expect(slack.status).toBe('disconnected')
  })

  it('should isolate channel faults on connect - one error should not affect others', async () => {
    const registry = new ChannelRegistry()
    const failingChannel = createStubChannel('whatsapp', {
      async connect() { throw new Error('WhatsApp auth failed') },
    })
    const workingChannel = createStubChannel('slack')

    registry.register(failingChannel, { platform: 'whatsapp', authDir: '/tmp/wa-auth' })
    registry.register(workingChannel, { platform: 'slack', botToken: process.env.SLACK_BOT_TOKEN ?? 'test-bot-token', appToken: process.env.SLACK_APP_TOKEN ?? 'test-app-token' })

    const results = await registry.connectAll()

    expect(results.get('whatsapp')?.success).toBe(false)
    expect(results.get('whatsapp')?.error).toBeInstanceOf(Error)
    expect(results.get('slack')?.success).toBe(true)
    expect(workingChannel.status).toBe('connected')
  })

  it('should isolate channel faults on disconnect - one error should not affect others', async () => {
    const registry = new ChannelRegistry()
    const failingChannel = createStubChannel('whatsapp', {
      async disconnect() { throw new Error('WhatsApp disconnect failed') },
    })
    const workingChannel = createStubChannel('slack')

    registry.register(failingChannel, { platform: 'whatsapp', authDir: '/tmp/wa-auth' })
    registry.register(workingChannel, { platform: 'slack', botToken: process.env.SLACK_BOT_TOKEN ?? 'test-bot-token', appToken: process.env.SLACK_APP_TOKEN ?? 'test-app-token' })

    await registry.connectAll()
    const results = await registry.disconnectAll()

    expect(results.get('whatsapp')?.success).toBe(false)
    expect(results.get('slack')?.success).toBe(true)
    expect(workingChannel.status).toBe('disconnected')
  })

  it('should prevent duplicate platform registration', () => {
    const registry = new ChannelRegistry()
    const ch1 = createStubChannel('whatsapp')
    const ch2 = createStubChannel('whatsapp')

    registry.register(ch1, { platform: 'whatsapp', authDir: '/tmp/wa-auth' })

    expect(() => registry.register(ch2, { platform: 'whatsapp', authDir: '/tmp/wa-auth2' }))
      .toThrow(/already registered/)
  })

  it('should reject registration when channel.platform mismatches config.platform', () => {
    const registry = new ChannelRegistry()
    const waChannel = createStubChannel('whatsapp')

    expect(() => registry.register(waChannel, { platform: 'slack', botToken: 'tok', appToken: 'tok' }))
      .toThrow(/does not match/)
  })

  it('should deliver messages to global handler via onAnyMessage', () => {
    const registry = new ChannelRegistry()
    const wa = createStubChannel('whatsapp')

    registry.register(wa, { platform: 'whatsapp', authDir: '/tmp/wa-auth' })

    const messages: IncomingMessage[] = []
    registry.onAnyMessage((msg: IncomingMessage) => { messages.push(msg) })

    wa._triggerMessage(createTestMessage('whatsapp'))

    expect(messages).toHaveLength(1)
    expect(messages[0].text).toBe('Hello from test')
  })

  it('should return readonly snapshot from getByPlatform', () => {
    const registry = new ChannelRegistry()
    const channel = createStubChannel('whatsapp')

    registry.register(channel, { platform: 'whatsapp', authDir: '/tmp/wa-auth' })

    const entry1 = registry.getByPlatform('whatsapp')
    const entry2 = registry.getByPlatform('whatsapp')

    expect(entry1).not.toBe(entry2)
  })
})
