import type { Channel, ChannelConfig, ChannelPlatform, ChannelStatus, IncomingMessage, MessageContent, MessageHandler } from '../types'

import { describe, expect, it } from 'vitest'

import { ChannelRegistry } from '../channel-registry'

// Test Double rationale: Real channels require external service connections
// (WhatsApp/Slack/Email/Feishu/DingTalk APIs). We use stub channels that
// implement the Channel interface to verify registry orchestration.

function createStubChannel(
  platform: ChannelPlatform,
  overrides?: Partial<Channel>,
): Channel & { _triggerMessage: (msg: IncomingMessage) => void } {
  let _status: ChannelStatus = 'disconnected'
  const handlers: MessageHandler[] = []
  const sentMessages: Array<{ target: string, content: MessageContent }> = []

  const channel: Channel & { _triggerMessage: (msg: IncomingMessage) => void } = {
    get platform() { return platform },
    get status() { return _status },

    async connect() {
      if (overrides?.connect) {
        return overrides.connect()
      }
      _status = 'connected'
    },

    async disconnect() {
      if (overrides?.disconnect) {
        return overrides.disconnect()
      }
      _status = 'disconnected'
    },

    async sendMessage(target: string, content: MessageContent) {
      if (overrides?.sendMessage) {
        return overrides.sendMessage(target, content)
      }
      sentMessages.push({ target, content })
    },

    onMessage(handler: MessageHandler): () => void {
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
  }

  return channel
}

function makeMessage(platform: ChannelPlatform, text: string): IncomingMessage {
  return {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    platform,
    channelId: `ch-${platform}`,
    senderId: `user-${platform}`,
    senderName: `User on ${platform}`,
    text,
    timestamp: new Date(),
  }
}

describe('phase 3 checkpoint: multi-channel integration', () => {
  describe('all 5 channel types registered and connected', () => {
    it('registers all 5 channel platforms successfully', () => {
      const registry = new ChannelRegistry()
      const platforms: ChannelPlatform[] = ['whatsapp', 'slack', 'email', 'feishu', 'dingtalk']

      for (const platform of platforms) {
        const channel = createStubChannel(platform)
        const config = { platform } as ChannelConfig
        registry.register(channel, config)
      }

      const all = registry.listAll()
      expect(all).toHaveLength(5)

      const registeredPlatforms = all.map(e => e.channel.platform).sort()
      expect(registeredPlatforms).toEqual(['dingtalk', 'email', 'feishu', 'slack', 'whatsapp'])
    })

    it('connects all 5 channels successfully via connectAll', async () => {
      const registry = new ChannelRegistry()
      const platforms: ChannelPlatform[] = ['whatsapp', 'slack', 'email', 'feishu', 'dingtalk']
      const channels: Channel[] = []

      for (const platform of platforms) {
        const channel = createStubChannel(platform)
        channels.push(channel)
        registry.register(channel, { platform } as ChannelConfig)
      }

      const results = await registry.connectAll()

      expect(results.size).toBe(5)
      for (const platform of platforms) {
        expect(results.get(platform)?.success).toBe(true)
      }

      // All channels should now be connected
      for (const channel of channels) {
        expect(channel.status).toBe('connected')
      }
    })

    it('disconnects all 5 channels successfully via disconnectAll', async () => {
      const registry = new ChannelRegistry()
      const platforms: ChannelPlatform[] = ['whatsapp', 'slack', 'email', 'feishu', 'dingtalk']
      const channels: Channel[] = []

      for (const platform of platforms) {
        const channel = createStubChannel(platform)
        channels.push(channel)
        registry.register(channel, { platform } as ChannelConfig)
      }

      await registry.connectAll()
      const results = await registry.disconnectAll()

      expect(results.size).toBe(5)
      for (const platform of platforms) {
        expect(results.get(platform)?.success).toBe(true)
      }

      for (const channel of channels) {
        expect(channel.status).toBe('disconnected')
      }
    })
  })

  describe('global message routing across all channels', () => {
    it('routes messages from any channel to global handler', async () => {
      const registry = new ChannelRegistry()
      const platforms: ChannelPlatform[] = ['whatsapp', 'slack', 'email', 'feishu', 'dingtalk']
      const channels = new Map<ChannelPlatform, ReturnType<typeof createStubChannel>>()

      for (const platform of platforms) {
        const channel = createStubChannel(platform)
        channels.set(platform, channel)
        registry.register(channel, { platform } as ChannelConfig)
      }

      const receivedMessages: IncomingMessage[] = []
      registry.onAnyMessage((msg) => {
        receivedMessages.push(msg)
      })

      // Send a message from each platform
      for (const [platform, channel] of channels) {
        channel._triggerMessage(makeMessage(platform, `Hello from ${platform}`))
      }

      expect(receivedMessages).toHaveLength(5)
      const messagePlatforms = receivedMessages.map(m => m.platform).sort()
      expect(messagePlatforms).toEqual(['dingtalk', 'email', 'feishu', 'slack', 'whatsapp'])
    })

    it('unsubscribe removes handler from global routing', async () => {
      const registry = new ChannelRegistry()
      const channel = createStubChannel('whatsapp')
      registry.register(channel, { platform: 'whatsapp' } as ChannelConfig)

      const received: IncomingMessage[] = []
      const unsubscribe = registry.onAnyMessage((msg) => {
        received.push(msg)
      })

      channel._triggerMessage(makeMessage('whatsapp', 'first'))
      expect(received).toHaveLength(1)

      unsubscribe()

      channel._triggerMessage(makeMessage('whatsapp', 'second'))
      expect(received).toHaveLength(1) // No new messages after unsubscribe
    })
  })

  describe('channel fault isolation', () => {
    it('one failing channel does not prevent others from connecting', async () => {
      const registry = new ChannelRegistry()

      const failingChannel = createStubChannel('email', {
        async connect() { throw new Error('IMAP connection failed') },
      })
      const workingChannels = (['whatsapp', 'slack', 'feishu', 'dingtalk'] as ChannelPlatform[]).map(p =>
        createStubChannel(p),
      )

      registry.register(failingChannel, { platform: 'email' } as ChannelConfig)
      for (const ch of workingChannels) {
        registry.register(ch, { platform: ch.platform } as ChannelConfig)
      }

      const results = await registry.connectAll()

      expect(results.get('email')?.success).toBe(false)
      expect(results.get('email')?.error?.message).toContain('IMAP connection failed')

      for (const platform of ['whatsapp', 'slack', 'feishu', 'dingtalk'] as ChannelPlatform[]) {
        expect(results.get(platform)?.success).toBe(true)
      }
    })

    it('one failing channel does not prevent others from disconnecting', async () => {
      const registry = new ChannelRegistry()

      const failingChannel = createStubChannel('slack', {
        async disconnect() { throw new Error('WebSocket close failed') },
      })
      const workingChannels = (['whatsapp', 'email', 'feishu', 'dingtalk'] as ChannelPlatform[]).map(p =>
        createStubChannel(p),
      )

      registry.register(failingChannel, { platform: 'slack' } as ChannelConfig)
      for (const ch of workingChannels) {
        registry.register(ch, { platform: ch.platform } as ChannelConfig)
      }

      await registry.connectAll()
      const results = await registry.disconnectAll()

      expect(results.get('slack')?.success).toBe(false)
      for (const platform of ['whatsapp', 'email', 'feishu', 'dingtalk'] as ChannelPlatform[]) {
        expect(results.get(platform)?.success).toBe(true)
      }
    })
  })

  describe('channel send/receive round-trip', () => {
    it('sends messages to a specific channel by platform', async () => {
      const registry = new ChannelRegistry()
      const sentLog: Array<{ platform: ChannelPlatform, target: string, content: MessageContent }> = []

      const platforms: ChannelPlatform[] = ['whatsapp', 'slack', 'email']
      for (const platform of platforms) {
        const channel = createStubChannel(platform, {
          async sendMessage(target: string, content: MessageContent) {
            sentLog.push({ platform, target, content })
          },
        })
        registry.register(channel, { platform } as ChannelConfig)
      }

      const whatsApp = registry.getByPlatform('whatsapp')!
      await whatsApp.channel.sendMessage('user-123', { text: 'Hello from Anima!' })

      expect(sentLog).toHaveLength(1)
      expect(sentLog[0]).toEqual({
        platform: 'whatsapp',
        target: 'user-123',
        content: { text: 'Hello from Anima!' },
      })
    })
  })

  describe('registry defensive behavior', () => {
    it('prevents duplicate platform registration', () => {
      const registry = new ChannelRegistry()
      const ch1 = createStubChannel('whatsapp')
      const ch2 = createStubChannel('whatsapp')

      registry.register(ch1, { platform: 'whatsapp' } as ChannelConfig)
      expect(() => registry.register(ch2, { platform: 'whatsapp' } as ChannelConfig))
        .toThrow(/already registered/)
    })

    it('prevents platform mismatch between channel and config', () => {
      const registry = new ChannelRegistry()
      const channel = createStubChannel('whatsapp')

      expect(() => registry.register(channel, { platform: 'slack' } as ChannelConfig))
        .toThrow(/does not match/)
    })

    it('returns undefined for unregistered platform', () => {
      const registry = new ChannelRegistry()
      expect(registry.getByPlatform('whatsapp')).toBeUndefined()
    })

    it('returns readonly snapshot from getByPlatform', () => {
      const registry = new ChannelRegistry()
      const channel = createStubChannel('whatsapp')
      registry.register(channel, { platform: 'whatsapp' } as ChannelConfig)

      const entry1 = registry.getByPlatform('whatsapp')
      const entry2 = registry.getByPlatform('whatsapp')

      // Different object references = defensive copy
      expect(entry1).not.toBe(entry2)
      expect(entry1!.channel.platform).toBe(entry2!.channel.platform)
    })
  })
})
