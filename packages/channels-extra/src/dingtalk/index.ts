import type { Channel, ChannelStatus, DingTalkConfig, IncomingMessage, MessageContent, MessageHandler } from '../types.js'

import { useLogg } from '@guiiai/logg'

const logger = useLogg('channels-extra:dingtalk')

const DINGTALK_ALLOWED_HOSTS = ['oapi.dingtalk.com']
const MAX_SESSION_WEBHOOKS = 10_000

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

interface StreamClient {
  connect: () => Promise<void>
  disconnect: () => void
  registerCallbackListener: (
    topic: string,
    handler: (event: { data: string }) => { status: string, message: string },
  ) => StreamClient
}

type WebhookSender = (
  webhookUrl: string,
  body: { msgtype: string, text: { content: string } },
) => Promise<unknown>

/** Dependencies for DingTalkChannel. Supply a factory for dingtalk-stream's DWClient. Optionally override sendViaWebhook (defaults to fetch-based POST to session webhook URL). */
export interface DingTalkChannelDeps {
  createStreamClient: () => StreamClient
  sendViaWebhook?: WebhookSender
}

type StatusChangeHandler = (status: ChannelStatus) => void

interface SessionWebhookEntry {
  url: string
  expiresAt: number
}

function isValidWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && DINGTALK_ALLOWED_HOSTS.includes(parsed.hostname)
  }
  catch {
    return false
  }
}

/** DingTalk channel via Stream protocol (WebSocket long connection). */
export class DingTalkChannel implements Channel {
  readonly platform = 'dingtalk' as const
  private _status: ChannelStatus = 'disconnected'
  private streamClient: StreamClient | null = null
  private messageHandlers: MessageHandler[] = []
  private statusHandlers: StatusChangeHandler[] = []
  private config: DingTalkConfig
  private deps: DingTalkChannelDeps | null
  private sessionWebhooks = new Map<string, SessionWebhookEntry>()

  constructor(config: DingTalkConfig, deps?: DingTalkChannelDeps) {
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
        `DingTalk channel requires createStreamClient dependency. Config platform: ${this.config.platform}`,
      )
    }

    try {
      this.streamClient = this.deps.createStreamClient()

      this.streamClient
        .registerCallbackListener('/v1.0/im/bot/messages/get', (event) => {
          return this.handleBotMessage(event)
        })

      await this.streamClient.connect()

      this.setStatus('connected')
      logger.log('DingTalk channel connected')
    }
    catch (error) {
      this.setStatus('error')
      throw new Error('DingTalk connect failed', { cause: error })
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.streamClient) {
        this.streamClient.disconnect()
        this.streamClient = null
      }
      this.sessionWebhooks.clear()
      this.setStatus('disconnected')
      logger.log('DingTalk channel disconnected')
    }
    catch (error) {
      this.setStatus('error')
      throw new Error('DingTalk disconnect failed', { cause: error })
    }
  }

  /**
   * Send a text message via session webhook URL.
   * @param target Session webhook URL from an incoming message (must be oapi.dingtalk.com)
   */
  async sendMessage(target: string, content: MessageContent): Promise<void> {
    if (this._status !== 'connected') {
      throw new Error(
        `DingTalk sendMessage failed: channel status is "${this._status}"`,
      )
    }

    if (!isValidWebhookUrl(target)) {
      throw new Error('DingTalk sendMessage failed: target URL is not a valid DingTalk webhook')
    }

    try {
      const sender = this.deps?.sendViaWebhook ?? defaultWebhookSender
      await sender(target, {
        msgtype: 'text',
        text: { content: content.text },
      })
      logger.withFields({ targetHost: new URL(target).hostname }).debug('dingtalk message sent')
    }
    catch (error) {
      throw new Error('DingTalk send failed', { cause: error })
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

  /** Get the most recent session webhook for a conversation. */
  getSessionWebhook(conversationId: string): string | undefined {
    const entry = this.sessionWebhooks.get(conversationId)
    if (!entry)
      return undefined
    if (Date.now() > entry.expiresAt) {
      this.sessionWebhooks.delete(conversationId)
      return undefined
    }
    return entry.url
  }

  private storeSessionWebhook(conversationId: string, url: string, expiresAt: number): void {
    if (this.sessionWebhooks.size >= MAX_SESSION_WEBHOOKS) {
      const oldestKey = this.sessionWebhooks.keys().next().value
      if (oldestKey)
        this.sessionWebhooks.delete(oldestKey)
    }
    this.sessionWebhooks.set(conversationId, { url, expiresAt })
  }

  private handleBotMessage(event: { data: string }): { status: string, message: string } {
    try {
      const message = JSON.parse(event.data) as DingTalkBotMessage

      if (message.msgtype !== 'text') {
        return { status: 'SUCCESS', message: 'non-text message ignored' }
      }

      const text = (message.text?.content ?? '').trim()
      if (!text) {
        return { status: 'SUCCESS', message: 'empty text ignored' }
      }

      if (message.sessionWebhook && isValidWebhookUrl(message.sessionWebhook)) {
        this.storeSessionWebhook(
          message.conversationId,
          message.sessionWebhook,
          message.sessionWebhookExpiredTime,
        )
      }

      const incomingMessage: IncomingMessage = {
        id: message.msgId,
        platform: 'dingtalk',
        channelId: message.conversationId,
        senderId: message.senderId,
        senderName: message.senderNick,
        text,
        timestamp: new Date(message.createAt),
        raw: message,
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

      return { status: 'SUCCESS', message: 'OK' }
    }
    catch (err) {
      logger.withError(err as Error).error('failed to handle bot message')
      return { status: 'LATER', message: `parse error: ${(err as Error).message}` }
    }
  }
}

async function defaultWebhookSender(
  webhookUrl: string,
  body: { msgtype: string, text: { content: string } },
): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    throw new Error(`DingTalk webhook request failed: ${response.status} ${response.statusText}`)
  }
}
