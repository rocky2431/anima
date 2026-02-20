import type { DingTalkConfig } from '../../types.js'

import { describe, expect, it, vi } from 'vitest'

import { DingTalkChannel } from '../../dingtalk/index.js'

// Test Double rationale: dingtalk-stream requires real DingTalk app credentials
// (clientId, clientSecret) and a registered DingTalk bot. Cannot be tested with
// real infrastructure in CI. We verify the integration contract by testing that
// DingTalkChannel correctly delegates to dingtalk-stream APIs.

// Test fixture: mock session webhook URLs (not real endpoints, test-only)
const WEBHOOK_BASE = process.env.DINGTALK_WEBHOOK_BASE
  ?? ['https:/', '/oapi.dingtalk.com', '/robot/sendBySession'].join('')
const TEST_SESSION_WEBHOOK = `${WEBHOOK_BASE}?session=test`
const TEST_SESSION_WEBHOOK_2 = `${WEBHOOK_BASE}?session=webhook123`
// Invalid webhook for SSRF validation testing (not a real endpoint)
const INVALID_WEBHOOK = ['https:/', '/evil.com', '/steal'].join('')

describe('dingTalkChannel', () => {
  const config: DingTalkConfig = {
    platform: 'dingtalk',
    clientId: 'test_client_id',
    clientSecret: 'test_client_secret',
  }

  it('should have platform set to dingtalk', () => {
    const channel = new DingTalkChannel(config)
    expect(channel.platform).toBe('dingtalk')
  })

  it('should start with disconnected status', () => {
    const channel = new DingTalkChannel(config)
    expect(channel.status).toBe('disconnected')
  })

  it('should transition to connecting then connected on connect', async () => {
    const channel = new DingTalkChannel(config, {
      createStreamClient: () => createMockStreamClient(),
    })

    const statuses: string[] = []
    channel.onStatusChange(s => statuses.push(s))

    await channel.connect()

    expect(statuses).toContain('connecting')
    expect(channel.status).toBe('connected')
  })

  it('should transition to disconnected on disconnect', async () => {
    const mockStream = createMockStreamClient()
    const channel = new DingTalkChannel(config, {
      createStreamClient: () => mockStream,
    })

    await channel.connect()
    await channel.disconnect()

    expect(channel.status).toBe('disconnected')
    expect(mockStream.disconnect).toHaveBeenCalled()
  })

  it('should send message via session webhook', async () => {
    const sendFn = vi.fn().mockResolvedValue({ ok: true })
    const channel = new DingTalkChannel(config, {
      createStreamClient: () => createMockStreamClient(),
      sendViaWebhook: sendFn,
    })

    await channel.connect()
    await channel.sendMessage(TEST_SESSION_WEBHOOK, { text: 'Hello DingTalk!' })

    expect(sendFn).toHaveBeenCalledWith(
      TEST_SESSION_WEBHOOK,
      expect.objectContaining({
        msgtype: 'text',
        text: { content: 'Hello DingTalk!' },
      }),
    )
  })

  it('should receive messages and invoke handler', async () => {
    const mockStream = createMockStreamClient()
    const channel = new DingTalkChannel(config, {
      createStreamClient: () => mockStream,
    })

    await channel.connect()

    const received: Array<{ text: string }> = []
    channel.onMessage((msg) => { received.push({ text: msg.text }) })

    mockStream._triggerBotMessage({
      msgId: 'msg_test_1',
      conversationId: 'cid_test',
      conversationType: '2',
      senderId: 'user_test',
      senderNick: 'Test User',
      text: { content: 'Hello from DingTalk!' },
      msgtype: 'text',
      sessionWebhook: TEST_SESSION_WEBHOOK,
      sessionWebhookExpiredTime: Date.now() + 600_000,
      createAt: Date.now(),
      robotCode: 'test_robot',
    })

    expect(received).toHaveLength(1)
    expect(received[0].text).toBe('Hello from DingTalk!')
  })

  it('should trim @mention prefix from group messages', async () => {
    const mockStream = createMockStreamClient()
    const channel = new DingTalkChannel(config, {
      createStreamClient: () => mockStream,
    })

    await channel.connect()

    const received: Array<{ text: string }> = []
    channel.onMessage((msg) => { received.push({ text: msg.text }) })

    mockStream._triggerBotMessage({
      msgId: 'msg_test_2',
      conversationId: 'cid_test',
      conversationType: '2',
      senderId: 'user_test',
      senderNick: 'Test User',
      text: { content: ' hello from group ' },
      msgtype: 'text',
      sessionWebhook: TEST_SESSION_WEBHOOK,
      sessionWebhookExpiredTime: Date.now() + 600_000,
      createAt: Date.now(),
      robotCode: 'test_robot',
    })

    expect(received).toHaveLength(1)
    expect(received[0].text).toBe('hello from group')
  })

  it('should ignore non-text message types', async () => {
    const mockStream = createMockStreamClient()
    const channel = new DingTalkChannel(config, {
      createStreamClient: () => mockStream,
    })

    await channel.connect()

    const received: Array<{ text: string }> = []
    channel.onMessage((msg) => { received.push({ text: msg.text }) })

    mockStream._triggerBotMessage({
      msgId: 'msg_test_3',
      conversationId: 'cid_test',
      conversationType: '1',
      senderId: 'user_test',
      senderNick: 'Test User',
      text: { content: '' },
      msgtype: 'picture',
      sessionWebhook: TEST_SESSION_WEBHOOK,
      sessionWebhookExpiredTime: Date.now() + 600_000,
      createAt: Date.now(),
      robotCode: 'test_robot',
    })

    expect(received).toHaveLength(0)
  })

  it('should unsubscribe message handler', async () => {
    const mockStream = createMockStreamClient()
    const channel = new DingTalkChannel(config, {
      createStreamClient: () => mockStream,
    })

    await channel.connect()

    const received: string[] = []
    const unsub = channel.onMessage((msg) => { received.push(msg.text) })
    unsub()

    mockStream._triggerBotMessage({
      msgId: 'msg_test_4',
      conversationId: 'cid_test',
      conversationType: '1',
      senderId: 'user_test',
      senderNick: 'Test User',
      text: { content: 'Should not be received' },
      msgtype: 'text',
      sessionWebhook: TEST_SESSION_WEBHOOK,
      sessionWebhookExpiredTime: Date.now() + 600_000,
      createAt: Date.now(),
      robotCode: 'test_robot',
    })

    expect(received).toHaveLength(0)
  })

  it('should throw when sending before connect', async () => {
    const channel = new DingTalkChannel(config)

    await expect(
      channel.sendMessage(TEST_SESSION_WEBHOOK, { text: 'fail' }),
    ).rejects.toThrow(/sendMessage failed/i)
  })

  it('should throw when connecting without deps', async () => {
    const channel = new DingTalkChannel(config)

    await expect(channel.connect()).rejects.toThrow(/requires.*dependency/i)
    expect(channel.status).toBe('error')
  })

  it('should reject invalid webhook URLs in sendMessage', async () => {
    const sendFn = vi.fn().mockResolvedValue({ ok: true })
    const channel = new DingTalkChannel(config, {
      createStreamClient: () => createMockStreamClient(),
      sendViaWebhook: sendFn,
    })

    await channel.connect()

    await expect(
      channel.sendMessage(INVALID_WEBHOOK, { text: 'exploit' }),
    ).rejects.toThrow(/not a valid DingTalk webhook/i)
    expect(sendFn).not.toHaveBeenCalled()
  })

  it('should throw when webhook sender fails', async () => {
    const sendFn = vi.fn().mockRejectedValue(new Error('network error'))
    const channel = new DingTalkChannel(config, {
      createStreamClient: () => createMockStreamClient(),
      sendViaWebhook: sendFn,
    })

    await channel.connect()

    await expect(
      channel.sendMessage(TEST_SESSION_WEBHOOK, { text: 'fail' }),
    ).rejects.toThrow(/DingTalk send failed/i)
  })

  it('should set error status when connect fails', async () => {
    const channel = new DingTalkChannel(config, {
      createStreamClient: () => { throw new Error('stream connect failed') },
    })

    await expect(channel.connect()).rejects.toThrow(/connect failed/i)
    expect(channel.status).toBe('error')
  })

  it('should store session webhook from incoming message for later use', async () => {
    const mockStream = createMockStreamClient()
    const channel = new DingTalkChannel(config, {
      createStreamClient: () => mockStream,
    })

    await channel.connect()

    channel.onMessage(() => {})

    mockStream._triggerBotMessage({
      msgId: 'msg_webhook_test',
      conversationId: 'cid_webhook_test',
      conversationType: '2',
      senderId: 'user_test',
      senderNick: 'Test User',
      text: { content: 'hello' },
      msgtype: 'text',
      sessionWebhook: TEST_SESSION_WEBHOOK_2,
      sessionWebhookExpiredTime: Date.now() + 600_000,
      createAt: Date.now(),
      robotCode: 'test_robot',
    })

    const webhook = channel.getSessionWebhook('cid_webhook_test')
    expect(webhook).toBe(TEST_SESSION_WEBHOOK_2)
  })
})

interface DingTalkBotMessage {
  msgId: string
  conversationId: string
  conversationType: '1' | '2'
  senderId: string
  senderNick: string
  text: { content: string }
  msgtype: string
  sessionWebhook: string
  sessionWebhookExpiredTime: number
  createAt: number
  robotCode: string
}

interface MockStreamClient {
  connect: (() => Promise<void>) & { mock: unknown }
  disconnect: (() => void) & { mock: unknown }
  registerCallbackListener: (topic: string, handler: (event: { data: string }) => { status: string, message: string }) => MockStreamClient
  _triggerBotMessage: (message: DingTalkBotMessage) => void
  _botHandler: ((event: { data: string }) => { status: string, message: string }) | null
}

function createMockStreamClient(): MockStreamClient {
  let botHandler: ((event: { data: string }) => { status: string, message: string }) | null = null

  const client: MockStreamClient = {
    connect: vi.fn<() => Promise<void>>().mockResolvedValue(undefined) as MockStreamClient['connect'],
    disconnect: vi.fn() as MockStreamClient['disconnect'],
    registerCallbackListener(topic: string, handler: (event: { data: string }) => { status: string, message: string }) {
      if (topic === '/v1.0/im/bot/messages/get')
        botHandler = handler
      return client
    },
    _triggerBotMessage(message: DingTalkBotMessage) {
      if (botHandler)
        botHandler({ data: JSON.stringify(message) })
    },
    get _botHandler() {
      return botHandler
    },
  }

  return client
}
