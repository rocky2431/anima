import type { Channel, ChannelStatus, IncomingMessage, MessageContent, MessageHandler, WhatsAppConfig } from '../types.js'

import { useLogg } from '@guiiai/logg'

const logger = useLogg('channels-extra:whatsapp')

interface BaileysSocket {
  sendMessage: (jid: string, content: { text: string }) => Promise<void>
  end: (error?: Error) => void
  ev: {
    on: (event: string, handler: (...args: unknown[]) => void) => void
    off: (event: string, handler: (...args: unknown[]) => void) => void
  }
}

interface BaileysMessage {
  key: {
    remoteJid: string
    fromMe: boolean
    id: string
  }
  message?: {
    conversation?: string
    extendedTextMessage?: { text?: string }
  }
  messageTimestamp?: number
}

interface BaileysUpsertEvent {
  messages: BaileysMessage[]
  type: string
}

export interface WhatsAppChannelDeps {
  createSocket: () => BaileysSocket
}

type StatusChangeHandler = (status: ChannelStatus) => void

/** WhatsApp channel implementation wrapping @whiskeysockets/baileys. */
export class WhatsAppChannel implements Channel {
  readonly platform = 'whatsapp' as const
  private _status: ChannelStatus = 'disconnected'
  private socket: BaileysSocket | null = null
  private messageHandlers: MessageHandler[] = []
  private statusHandlers: StatusChangeHandler[] = []
  private config: WhatsAppConfig
  private deps: WhatsAppChannelDeps | null
  private sentTimestamps: number[] = []

  constructor(config: WhatsAppConfig, deps?: WhatsAppChannelDeps) {
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
        `WhatsApp channel requires createSocket dependency. Config authDir: ${this.config.authDir}`,
      )
    }

    try {
      this.socket = this.deps.createSocket()
      this.setupEventHandlers()
      this.setStatus('connected')
      logger.log('WhatsApp channel connected')
    }
    catch (error) {
      this.setStatus('error')
      throw new Error('WhatsApp connect failed', { cause: error })
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.socket) {
        this.socket.end()
        this.socket = null
      }
      this.setStatus('disconnected')
      logger.log('WhatsApp channel disconnected')
    }
    catch (error) {
      this.setStatus('error')
      throw new Error('WhatsApp disconnect failed', { cause: error })
    }
  }

  /**
   * Send a text message.
   * @param target WhatsApp JID (e.g. '12345678901@s.whatsapp.net')
   */
  async sendMessage(target: string, content: MessageContent): Promise<void> {
    if (!this.socket || this._status !== 'connected') {
      throw new Error(
        `WhatsApp sendMessage failed: channel status is "${this._status}", target: ${target}`,
      )
    }

    this.enforceRateLimit()
    await this.socket.sendMessage(target, { text: content.text })
    this.sentTimestamps.push(Date.now())
    logger.withFields({ target }).debug('message sent')
  }

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.push(handler)
    return () => {
      const idx = this.messageHandlers.indexOf(handler)
      if (idx >= 0)
        this.messageHandlers.splice(idx, 1)
    }
  }

  private parseMessage(msg: BaileysMessage): IncomingMessage | null {
    if (msg.key.fromMe)
      return null
    if (!msg.message)
      return null

    const text = msg.message.conversation
      ?? msg.message.extendedTextMessage?.text
      ?? ''

    if (!text)
      return null

    return {
      id: msg.key.id,
      platform: 'whatsapp',
      channelId: msg.key.remoteJid,
      senderId: msg.key.remoteJid,
      text,
      timestamp: new Date((msg.messageTimestamp ?? 0) * 1000),
      raw: msg,
    }
  }

  private setupEventHandlers(): void {
    if (!this.socket)
      return

    this.socket.ev.on('messages.upsert', (data: unknown) => {
      if (!isBaileysUpsertEvent(data)) {
        logger.warn('received non-standard messages.upsert event shape')
        return
      }

      for (const msg of data.messages) {
        const parsed = this.parseMessage(msg)
        if (!parsed)
          continue

        for (const handler of this.messageHandlers) {
          try {
            const result = handler(parsed)
            if (result instanceof Promise) {
              result.catch(err => logger.withError(err as Error).error('async message handler error'))
            }
          }
          catch (err) {
            logger.withError(err as Error).error('sync message handler error')
          }
        }
      }
    })
  }

  private enforceRateLimit(): void {
    const limit = this.config.rateLimitPerMinute
    if (!limit)
      return

    const oneMinuteAgo = Date.now() - 60_000
    this.sentTimestamps = this.sentTimestamps.filter(ts => ts > oneMinuteAgo)

    if (this.sentTimestamps.length >= limit) {
      throw new Error(`WhatsApp rate limit exceeded: ${limit} messages per minute`)
    }
  }
}

function isBaileysUpsertEvent(data: unknown): data is BaileysUpsertEvent {
  return (
    typeof data === 'object'
    && data !== null
    && 'messages' in data
    && Array.isArray((data as BaileysUpsertEvent).messages)
  )
}
