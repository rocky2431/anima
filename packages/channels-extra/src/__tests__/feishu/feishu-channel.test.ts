import type { FeishuConfig } from '../../types.js'

import { describe, expect, it, vi } from 'vitest'

import { FeishuChannel } from '../../feishu/index.js'

// Test Double rationale: @larksuiteoapi/node-sdk requires real Feishu credentials
// (appId, appSecret) and a registered Feishu app. Cannot be tested with real
// infrastructure in CI. We verify the integration contract by testing that
// FeishuChannel correctly delegates to Feishu SDK APIs.

describe('feishuChannel', () => {
  const config: FeishuConfig = {
    platform: 'feishu',
    appId: 'cli_test_app_id',
    appSecret: 'test_app_secret',
  }

  it('should have platform set to feishu', () => {
    const channel = new FeishuChannel(config)
    expect(channel.platform).toBe('feishu')
  })

  it('should start with disconnected status', () => {
    const channel = new FeishuChannel(config)
    expect(channel.status).toBe('disconnected')
  })

  it('should transition to connecting then connected on connect', async () => {
    const channel = new FeishuChannel(config, {
      createClient: () => createMockFeishuClient(),
      createWsClient: () => createMockWsClient(),
    })

    const statuses: string[] = []
    channel.onStatusChange(s => statuses.push(s))

    await channel.connect()

    expect(statuses).toContain('connecting')
    expect(channel.status).toBe('connected')
  })

  it('should transition to disconnected on disconnect', async () => {
    const mockWs = createMockWsClient()
    const channel = new FeishuChannel(config, {
      createClient: () => createMockFeishuClient(),
      createWsClient: () => mockWs,
    })

    await channel.connect()
    await channel.disconnect()

    expect(channel.status).toBe('disconnected')
  })

  it('should send message via Feishu client', async () => {
    const createFn = vi.fn().mockResolvedValue({ code: 0 })
    const mockClient = createMockFeishuClient({ messageCreate: createFn })
    const channel = new FeishuChannel(config, {
      createClient: () => mockClient,
      createWsClient: () => createMockWsClient(),
    })

    await channel.connect()
    await channel.sendMessage('oc_test_chat_id', { text: 'Hello Feishu!' })

    expect(createFn).toHaveBeenCalledWith(expect.objectContaining({
      params: expect.objectContaining({ receive_id_type: 'chat_id' }),
      data: expect.objectContaining({
        receive_id: 'oc_test_chat_id',
        msg_type: 'text',
      }),
    }))
  })

  it('should use configured receive_id_type', async () => {
    const createFn = vi.fn().mockResolvedValue({ code: 0 })
    const mockClient = createMockFeishuClient({ messageCreate: createFn })
    const customConfig: FeishuConfig = { ...config, receiveIdType: 'open_id' }
    const channel = new FeishuChannel(customConfig, {
      createClient: () => mockClient,
      createWsClient: () => createMockWsClient(),
    })

    await channel.connect()
    await channel.sendMessage('ou_test_open_id', { text: 'Hello!' })

    expect(createFn).toHaveBeenCalledWith(expect.objectContaining({
      params: expect.objectContaining({ receive_id_type: 'open_id' }),
    }))
  })

  it('should receive messages and invoke handler', async () => {
    const mockWs = createMockWsClient()
    const channel = new FeishuChannel(config, {
      createClient: () => createMockFeishuClient(),
      createWsClient: () => mockWs,
    })

    await channel.connect()

    const received: Array<{ text: string }> = []
    channel.onMessage((msg) => { received.push({ text: msg.text }) })

    mockWs._triggerMessage({
      message: {
        message_id: 'om_test_msg_1',
        chat_id: 'oc_test_chat',
        chat_type: 'group',
        message_type: 'text',
        content: JSON.stringify({ text: 'Hello from Feishu!' }),
        create_time: String(Date.now()),
      },
      sender: {
        sender_id: { open_id: 'ou_test_user', user_id: '', union_id: '' },
        sender_type: 'user',
        tenant_key: 'test_tenant',
      },
    })

    expect(received).toHaveLength(1)
    expect(received[0].text).toBe('Hello from Feishu!')
  })

  it('should ignore bot messages', async () => {
    const mockWs = createMockWsClient()
    const channel = new FeishuChannel(config, {
      createClient: () => createMockFeishuClient(),
      createWsClient: () => mockWs,
    })

    await channel.connect()

    const received: Array<{ text: string }> = []
    channel.onMessage((msg) => { received.push({ text: msg.text }) })

    mockWs._triggerMessage({
      message: {
        message_id: 'om_bot_msg',
        chat_id: 'oc_test_chat',
        chat_type: 'group',
        message_type: 'text',
        content: JSON.stringify({ text: 'Bot message' }),
        create_time: String(Date.now()),
      },
      sender: {
        sender_id: { open_id: 'ou_bot', user_id: '', union_id: '' },
        sender_type: 'bot',
        tenant_key: 'test_tenant',
      },
    })

    expect(received).toHaveLength(0)
  })

  it('should unsubscribe message handler', async () => {
    const mockWs = createMockWsClient()
    const channel = new FeishuChannel(config, {
      createClient: () => createMockFeishuClient(),
      createWsClient: () => mockWs,
    })

    await channel.connect()

    const received: string[] = []
    const unsub = channel.onMessage((msg) => { received.push(msg.text) })
    unsub()

    mockWs._triggerMessage({
      message: {
        message_id: 'om_test',
        chat_id: 'oc_test',
        chat_type: 'p2p',
        message_type: 'text',
        content: JSON.stringify({ text: 'Should not be received' }),
        create_time: String(Date.now()),
      },
      sender: {
        sender_id: { open_id: 'ou_user', user_id: '', union_id: '' },
        sender_type: 'user',
        tenant_key: 'test_tenant',
      },
    })

    expect(received).toHaveLength(0)
  })

  it('should throw when sending before connect', async () => {
    const channel = new FeishuChannel(config)

    await expect(
      channel.sendMessage('oc_test', { text: 'fail' }),
    ).rejects.toThrow(/sendMessage failed/i)
  })

  it('should throw when connecting without deps', async () => {
    const channel = new FeishuChannel(config)

    await expect(channel.connect()).rejects.toThrow(/requires.*dependency/i)
    expect(channel.status).toBe('error')
  })

  it('should throw when Feishu API returns error code', async () => {
    const createFn = vi.fn().mockResolvedValue({ code: 99991 })
    const mockClient = createMockFeishuClient({ messageCreate: createFn })
    const channel = new FeishuChannel(config, {
      createClient: () => mockClient,
      createWsClient: () => createMockWsClient(),
    })

    await channel.connect()

    await expect(
      channel.sendMessage('oc_test', { text: 'fail' }),
    ).rejects.toThrow(/Feishu send to oc_test failed/i)
  })

  it('should throw when Feishu API call rejects', async () => {
    const createFn = vi.fn().mockRejectedValue(new Error('network error'))
    const mockClient = createMockFeishuClient({ messageCreate: createFn })
    const channel = new FeishuChannel(config, {
      createClient: () => mockClient,
      createWsClient: () => createMockWsClient(),
    })

    await channel.connect()

    await expect(
      channel.sendMessage('oc_test', { text: 'fail' }),
    ).rejects.toThrow(/Feishu send to oc_test failed/i)
  })

  it('should set error status when connect fails', async () => {
    const channel = new FeishuChannel(config, {
      createClient: () => { throw new Error('client create failed') },
      createWsClient: () => createMockWsClient(),
    })

    await expect(channel.connect()).rejects.toThrow(/connect failed/i)
    expect(channel.status).toBe('error')
  })
})

interface FeishuMessageEvent {
  message: {
    message_id: string
    chat_id: string
    chat_type: 'p2p' | 'group'
    message_type: string
    content: string
    create_time: string
  }
  sender: {
    sender_id: { open_id: string, user_id: string, union_id: string }
    sender_type: 'user' | 'bot'
    tenant_key: string
  }
}

interface MockFeishuClient {
  im: {
    message: {
      create: (request: unknown) => Promise<{ code: number }>
    }
  }
}

interface MockWsClient {
  start: (options: { eventDispatcher: unknown }) => void
  _triggerMessage: (event: FeishuMessageEvent) => void
  _messageHandler: ((data: FeishuMessageEvent) => void) | null
}

function createMockFeishuClient(
  overrides: Partial<{ messageCreate: (request: unknown) => Promise<{ code: number }> }> = {},
): MockFeishuClient {
  return {
    im: {
      message: {
        create: overrides.messageCreate ?? vi.fn().mockResolvedValue({ code: 0 }),
      },
    },
  }
}

function createMockWsClient(): MockWsClient {
  let messageHandler: ((data: FeishuMessageEvent) => void) | null = null

  return {
    start(options: { eventDispatcher: unknown }) {
      // Extract the registered handler from the event dispatcher
      const dispatcher = options.eventDispatcher as { _handlers?: Map<string, (data: FeishuMessageEvent) => void> }
      if (dispatcher && dispatcher._handlers) {
        messageHandler = dispatcher._handlers.get('im.message.receive_v1') ?? null
      }
    },
    _triggerMessage(event: FeishuMessageEvent) {
      if (messageHandler)
        messageHandler(event)
    },
    get _messageHandler() {
      return messageHandler
    },
  }
}
