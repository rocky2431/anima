import type { Channel, ChannelStatus, IncomingMessage, MessageContent, MessageHandler, SlackConfig } from '../types.js'

import { useLogg } from '@guiiai/logg'

const logger = useLogg('channels-extra:slack')

interface BoltApp {
  start: () => Promise<void>
  stop: () => Promise<void>
  client: {
    chat: {
      postMessage: (args: { channel: string, text: string }) => Promise<{ ok: boolean }>
    }
  }
  message: (handler: (args: { message: SlackMessage, say: (...args: unknown[]) => Promise<void> }) => Promise<void>) => void
}

interface SlackMessage {
  text: string
  user: string
  channel: string
  ts: string
  bot_id?: string
}

export interface SlackChannelDeps {
  createApp: () => BoltApp
}

type StatusChangeHandler = (status: ChannelStatus) => void

/** Slack channel implementation wrapping @slack/bolt. */
export class SlackChannel implements Channel {
  readonly platform = 'slack' as const
  private _status: ChannelStatus = 'disconnected'
  private app: BoltApp | null = null
  private messageHandlers: MessageHandler[] = []
  private statusHandlers: StatusChangeHandler[] = []
  private config: SlackConfig
  private deps: SlackChannelDeps | null

  constructor(config: SlackConfig, deps?: SlackChannelDeps) {
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
        `Slack channel requires createApp dependency. Config platform: ${this.config.platform}`,
      )
    }

    try {
      this.app = this.deps.createApp()
      this.setupMessageListener()
      await this.app.start()
      this.setStatus('connected')
      logger.log('Slack channel connected')
    }
    catch (error) {
      this.setStatus('error')
      throw new Error('Slack connect failed', { cause: error })
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.app) {
        await this.app.stop()
        this.app = null
      }
      this.setStatus('disconnected')
      logger.log('Slack channel disconnected')
    }
    catch (error) {
      this.setStatus('error')
      throw new Error('Slack disconnect failed', { cause: error })
    }
  }

  /**
   * Send a text message.
   * @param target Slack channel ID (e.g. 'C12345')
   */
  async sendMessage(target: string, content: MessageContent): Promise<void> {
    if (!this.app || this._status !== 'connected') {
      throw new Error(
        `Slack sendMessage failed: channel status is "${this._status}", target: ${target}`,
      )
    }

    await this.app.client.chat.postMessage({
      channel: target,
      text: content.text,
    })
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

  private isValidSlackMessage(message: unknown): message is SlackMessage {
    if (typeof message !== 'object' || message === null)
      return false
    const msg = message as Record<string, unknown>
    return (
      typeof msg.text === 'string'
      && typeof msg.user === 'string'
      && typeof msg.channel === 'string'
      && typeof msg.ts === 'string'
    )
  }

  private setupMessageListener(): void {
    if (!this.app)
      return

    this.app.message(async ({ message }) => {
      if (!this.isValidSlackMessage(message))
        return

      if (message.bot_id)
        return
      if (!message.text)
        return

      const incomingMessage: IncomingMessage = {
        id: message.ts,
        platform: 'slack',
        channelId: message.channel,
        senderId: message.user,
        text: message.text,
        timestamp: new Date(Number.parseFloat(message.ts) * 1000),
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
    })
  }
}
