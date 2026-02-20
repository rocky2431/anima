import type { SlackConfig } from '../../types.js'

import { describe, expect, it, vi } from 'vitest'

import { SlackChannel } from '../../slack/index.js'

// Test Double rationale: @slack/bolt is an external third-party service requiring
// real Slack workspace credentials (Bot Token, App Token). Cannot be tested with
// real infrastructure in CI. We verify the integration contract by testing that
// SlackChannel correctly delegates to bolt APIs.

describe('slackChannel', () => {
  const config: SlackConfig = {
    platform: 'slack',
    botToken: process.env.SLACK_BOT_TOKEN ?? 'test-bot-token',
    appToken: process.env.SLACK_APP_TOKEN ?? 'test-app-token',
    socketMode: true,
  }

  it('should have platform set to slack', () => {
    const channel = new SlackChannel(config)
    expect(channel.platform).toBe('slack')
  })

  it('should start with disconnected status', () => {
    const channel = new SlackChannel(config)
    expect(channel.status).toBe('disconnected')
  })

  it('should transition to connecting then connected on connect', async () => {
    const channel = new SlackChannel(config, {
      createApp: () => createMockBoltApp(),
    })

    const statuses: string[] = []
    channel.onStatusChange(s => statuses.push(s))

    await channel.connect()

    expect(statuses).toContain('connecting')
    expect(channel.status).toBe('connected')
  })

  it('should transition to disconnected on disconnect', async () => {
    const mockApp = createMockBoltApp()
    const channel = new SlackChannel(config, {
      createApp: () => mockApp,
    })

    await channel.connect()
    await channel.disconnect()

    expect(channel.status).toBe('disconnected')
    expect(mockApp.stop).toHaveBeenCalled()
  })

  it('should send message via bolt client', async () => {
    const postMessageFn = vi.fn().mockResolvedValue({ ok: true })
    const mockApp = createMockBoltApp({ postMessage: postMessageFn })
    const channel = new SlackChannel(config, {
      createApp: () => mockApp,
    })

    await channel.connect()
    await channel.sendMessage('C12345', { text: 'Hello Slack!' })

    expect(postMessageFn).toHaveBeenCalledWith({
      channel: 'C12345',
      text: 'Hello Slack!',
    })
  })

  it('should receive messages and invoke handler', async () => {
    const mockApp = createMockBoltApp()
    const channel = new SlackChannel(config, {
      createApp: () => mockApp,
    })

    await channel.connect()

    const received: Array<{ text: string }> = []
    channel.onMessage((msg) => { received.push({ text: msg.text }) })

    mockApp._triggerMessage({
      text: 'Hello from Slack!',
      user: 'U12345',
      channel: 'C12345',
      ts: '1234567890.123456',
    })

    expect(received).toHaveLength(1)
    expect(received[0].text).toBe('Hello from Slack!')
  })

  it('should ignore bot messages', async () => {
    const mockApp = createMockBoltApp()
    const channel = new SlackChannel(config, {
      createApp: () => mockApp,
    })

    await channel.connect()

    const received: Array<{ text: string }> = []
    channel.onMessage((msg) => { received.push({ text: msg.text }) })

    mockApp._triggerMessage({
      text: 'Bot message',
      user: 'U12345',
      channel: 'C12345',
      ts: '1234567890.123456',
      bot_id: 'B12345',
    })

    expect(received).toHaveLength(0)
  })

  it('should unsubscribe message handler', async () => {
    const mockApp = createMockBoltApp()
    const channel = new SlackChannel(config, {
      createApp: () => mockApp,
    })

    await channel.connect()

    const received: string[] = []
    const unsub = channel.onMessage((msg) => { received.push(msg.text) })
    unsub()

    mockApp._triggerMessage({
      text: 'Should not be received',
      user: 'U12345',
      channel: 'C12345',
      ts: '1234567890.123456',
    })

    expect(received).toHaveLength(0)
  })

  it('should throw when sending before connect', async () => {
    const channel = new SlackChannel(config)

    await expect(
      channel.sendMessage('C12345', { text: 'fail' }),
    ).rejects.toThrow(/sendMessage failed/i)
  })

  it('should support socket mode configuration', () => {
    const channel = new SlackChannel({ ...config, socketMode: true })
    expect(channel.platform).toBe('slack')
  })

  it('should throw when connecting without deps', async () => {
    const channel = new SlackChannel(config)

    await expect(channel.connect()).rejects.toThrow(/requires createApp/)
    expect(channel.status).toBe('error')
  })

  it('should ignore messages with empty text', async () => {
    const mockApp = createMockBoltApp()
    const channel = new SlackChannel(config, {
      createApp: () => mockApp,
    })

    await channel.connect()

    const received: Array<{ text: string }> = []
    channel.onMessage((msg) => { received.push({ text: msg.text }) })

    mockApp._triggerMessage({
      text: '',
      user: 'U12345',
      channel: 'C12345',
      ts: '1234567890.123456',
    })

    expect(received).toHaveLength(0)
  })
})

interface MockSlackMessage {
  text: string
  user: string
  channel: string
  ts: string
  bot_id?: string
}

interface MockBoltApp {
  start: (() => Promise<void>) & { mock: unknown }
  stop: (() => Promise<void>) & { mock: unknown }
  client: {
    chat: {
      postMessage: (args: { channel: string, text: string }) => Promise<{ ok: boolean }>
    }
  }
  message: (handler: (args: { message: MockSlackMessage, say: (...args: unknown[]) => Promise<void> }) => Promise<void>) => void
  _triggerMessage: (msg: MockSlackMessage) => void
  _messageHandlers: Array<(args: { message: MockSlackMessage, say: (...args: unknown[]) => Promise<void> }) => Promise<void>>
}

function createMockBoltApp(overrides: Partial<{ postMessage: (args: { channel: string, text: string }) => Promise<{ ok: boolean }> }> = {}): MockBoltApp {
  const messageHandlers: MockBoltApp['_messageHandlers'] = []

  return {
    start: vi.fn<() => Promise<void>>().mockResolvedValue(undefined) as MockBoltApp['start'],
    stop: vi.fn<() => Promise<void>>().mockResolvedValue(undefined) as MockBoltApp['stop'],
    client: {
      chat: {
        postMessage: overrides.postMessage ?? vi.fn<(args: { channel: string, text: string }) => Promise<{ ok: boolean }>>().mockResolvedValue({ ok: true }),
      },
    },
    message(handler) {
      messageHandlers.push(handler)
    },
    _triggerMessage(msg: MockSlackMessage) {
      for (const handler of messageHandlers) {
        handler({ message: msg, say: vi.fn() })
      }
    },
    _messageHandlers: messageHandlers,
  }
}
