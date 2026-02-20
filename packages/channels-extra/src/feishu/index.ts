import type { Channel, ChannelStatus, FeishuConfig, IncomingMessage, MessageContent, MessageHandler } from '../types.js'

import { useLogg } from '@guiiai/logg'

const logger = useLogg('channels-extra:feishu')

interface FeishuClient {
  im: {
    message: {
      create: (request: {
        params: { receive_id_type: string }
        data: { receive_id: string, content: string, msg_type: string }
      }) => Promise<{ code: number }>
    }
  }
}

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
    sender_type: string
    tenant_key: string
  }
}

interface FeishuEventDispatcher {
  _handlers: Map<string, (data: FeishuMessageEvent) => void>
}

interface FeishuWsClient {
  start: (options: { eventDispatcher: FeishuEventDispatcher }) => void
}

export interface FeishuChannelDeps {
  createClient: () => FeishuClient
  createWsClient: () => FeishuWsClient
}

type StatusChangeHandler = (status: ChannelStatus) => void

/** Feishu (Lark) channel via WebSocket long connection. */
export class FeishuChannel implements Channel {
  readonly platform = 'feishu' as const
  private _status: ChannelStatus = 'disconnected'
  private client: FeishuClient | null = null
  private wsClient: FeishuWsClient | null = null
  private messageHandlers: MessageHandler[] = []
  private statusHandlers: StatusChangeHandler[] = []
  private config: FeishuConfig
  private deps: FeishuChannelDeps | null

  constructor(config: FeishuConfig, deps?: FeishuChannelDeps) {
    this.config = config
    this.deps = deps ?? null
  }

  get status(): ChannelStatus {
    return this._status
  }

  private setStatus(status: ChannelStatus): void {
    this._status = status
    for (const handler of this.statusHandlers) {
      try {
        handler(status)
      }
      catch (err) {
        logger.withFields({ status }).withError(err as Error).error('status handler error')
      }
    }
  }

  onStatusChange(handler: StatusChangeHandler): () => void {
    this.statusHandlers.push(handler)
    return () => {
      const idx = this.statusHandlers.indexOf(handler)
      if (idx >= 0)
        this.statusHandlers.splice(idx, 1)
    }
  }

  async connect(): Promise<void> {
    this.setStatus('connecting')

    if (!this.deps) {
      this.setStatus('error')
      throw new Error(
        `Feishu channel requires createClient and createWsClient dependency. Config platform: ${this.config.platform}`,
      )
    }

    try {
      this.client = this.deps.createClient()
      this.wsClient = this.deps.createWsClient()

      const eventDispatcher = this.createEventDispatcher()
      this.wsClient.start({ eventDispatcher })

      this.setStatus('connected')
      logger.log('Feishu channel connected')
    }
    catch (error) {
      this.setStatus('error')
      throw new Error('Feishu connect failed', { cause: error })
    }
  }

  async disconnect(): Promise<void> {
    try {
      this.client = null
      this.wsClient = null
      this.setStatus('disconnected')
      logger.log('Feishu channel disconnected')
    }
    catch (error) {
      this.setStatus('error')
      throw new Error('Feishu disconnect failed', { cause: error })
    }
  }

  async sendMessage(target: string, content: MessageContent): Promise<void> {
    if (!this.client || this._status !== 'connected') {
      throw new Error(
        `Feishu sendMessage failed: channel status is "${this._status}", target: ${target}`,
      )
    }

    const receiveIdType = this.config.receiveIdType ?? 'chat_id'

    try {
      const result = await this.client.im.message.create({
        params: { receive_id_type: receiveIdType },
        data: {
          receive_id: target,
          content: JSON.stringify({ text: content.text }),
          msg_type: 'text',
        },
      })

      if (result.code !== 0) {
        throw new Error(`Feishu API returned error code ${result.code}`)
      }

      logger.withFields({ target, receiveIdType }).debug('feishu message sent')
    }
    catch (error) {
      throw new Error(`Feishu send to ${target} failed`, { cause: error })
    }
  }

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.push(handler)
    return () => {
      const idx = this.messageHandlers.indexOf(handler)
      if (idx >= 0)
        this.messageHandlers.splice(idx, 1)
    }
  }

  private createEventDispatcher(): FeishuEventDispatcher {
    const handlers = new Map<string, (data: FeishuMessageEvent) => void>()

    handlers.set('im.message.receive_v1', (data: FeishuMessageEvent) => {
      this.handleIncomingMessage(data)
    })

    return { _handlers: handlers }
  }

  private handleIncomingMessage(data: FeishuMessageEvent): void {
    if (data.sender.sender_type === 'bot')
      return

    const { message } = data

    let text = ''
    try {
      const parsed = JSON.parse(message.content) as { text?: string }
      text = parsed.text ?? ''
    }
    catch {
      logger.withFields({ messageId: message.message_id }).warn('failed to parse message content')
      return
    }

    if (!text)
      return

    const incomingMessage: IncomingMessage = {
      id: message.message_id,
      platform: 'feishu',
      channelId: message.chat_id,
      senderId: data.sender.sender_id.open_id,
      text,
      timestamp: new Date(Number(message.create_time)),
      raw: data,
    }

    for (const handler of this.messageHandlers) {
      try {
        const result = handler(incomingMessage)
        if (result instanceof Promise) {
          result.catch(err => logger.withError(err as Error).error('async message handler error'))
        }
      }
      catch (err) {
        logger.withError(err as Error).error('sync message handler error')
      }
    }
  }
}
