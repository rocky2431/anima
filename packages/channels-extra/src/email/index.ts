import type { Channel, ChannelStatus, EmailConfig, IncomingMessage, MessageContent, MessageHandler } from '../types.js'

import { useLogg } from '@guiiai/logg'

const logger = useLogg('channels-extra:email')

interface ImapClient {
  connect: () => Promise<void>
  logout: () => Promise<void>
  getMailboxLock: (mailbox: string) => Promise<{ release: () => void }>
  on: (event: string, handler: (...args: unknown[]) => void) => void
  off: (event: string, handler: (...args: unknown[]) => void) => void
  fetch: (range: string, options: Record<string, boolean>) => AsyncIterable<FetchMessage>
}

interface FetchMessage {
  uid: number
  envelope: {
    from: Array<{ name: string, address: string }>
    subject: string
    date: Date
  }
  source: Buffer
}

interface SmtpTransport {
  sendMail: (options: {
    from: string
    to: string
    subject: string
    text: string
  }) => Promise<{ messageId: string }>
  verify: () => Promise<boolean>
  close: () => void
}

/** Dependencies for EmailChannel. Callers must supply factory functions that create IMAP and SMTP clients configured with credentials from EmailConfig. */
export interface EmailChannelDeps {
  createImapClient: () => ImapClient
  createSmtpTransport: () => SmtpTransport
}

type StatusChangeHandler = (status: ChannelStatus) => void

/** Email channel: receives via IMAP IDLE, sends via SMTP. */
export class EmailChannel implements Channel {
  readonly platform = 'email' as const
  private _status: ChannelStatus = 'disconnected'
  private imapClient: ImapClient | null = null
  private smtpTransport: SmtpTransport | null = null
  private mailboxLock: { release: () => void } | null = null
  private messageHandlers: MessageHandler[] = []
  private statusHandlers: StatusChangeHandler[] = []
  private config: EmailConfig
  private deps: EmailChannelDeps | null

  constructor(config: EmailConfig, deps?: EmailChannelDeps) {
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
        `Email channel requires createImapClient and createSmtpTransport dependency. Config platform: ${this.config.platform}`,
      )
    }

    try {
      this.imapClient = this.deps.createImapClient()
      this.smtpTransport = this.deps.createSmtpTransport()

      await this.imapClient.connect()
      this.setupExistsListener()

      const mailbox = this.config.mailbox ?? 'INBOX'
      this.mailboxLock = await this.imapClient.getMailboxLock(mailbox)

      this.setStatus('connected')
      logger.withFields({ mailbox }).log('Email channel connected')
    }
    catch (error) {
      this.setStatus('error')
      throw new Error('Email connect failed', { cause: error })
    }
  }

  async disconnect(): Promise<void> {
    const errors: Error[] = []

    try {
      if (this.mailboxLock)
        this.mailboxLock.release()
    }
    catch (err) { errors.push(err as Error) }
    finally { this.mailboxLock = null }

    try {
      if (this.imapClient)
        await this.imapClient.logout()
    }
    catch (err) { errors.push(err as Error) }
    finally { this.imapClient = null }

    try {
      if (this.smtpTransport)
        this.smtpTransport.close()
    }
    catch (err) { errors.push(err as Error) }
    finally { this.smtpTransport = null }

    if (errors.length > 0) {
      this.setStatus('error')
      throw new Error('Email disconnect failed', { cause: errors[0] })
    }

    this.setStatus('disconnected')
    logger.log('Email channel disconnected')
  }

  async sendMessage(target: string, content: MessageContent): Promise<void> {
    if (!this.smtpTransport || this._status !== 'connected') {
      throw new Error(
        `Email sendMessage failed: channel status is "${this._status}"`,
      )
    }

    try {
      await this.smtpTransport.sendMail({
        from: this.config.fromAddress,
        to: target,
        subject: 'Message from Anima',
        text: content.text,
      })
      logger.withFields({ target }).debug('email sent')
    }
    catch (error) {
      throw new Error(`Email send to ${target} failed`, { cause: error })
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

  private setupExistsListener(): void {
    if (!this.imapClient)
      return

    this.imapClient.on('exists', (data: unknown) => {
      if (!isExistsEvent(data))
        return
      const newCount = data.count - data.prevCount
      if (newCount > 0) {
        this.fetchNewMessages(data.prevCount + 1, data.count)
          .catch(err => logger.withError(err as Error).error('fetch new messages failed'))
      }
    })
  }

  private async fetchNewMessages(fromSeq: number, toSeq: number): Promise<void> {
    if (!this.imapClient)
      return

    const range = `${fromSeq}:${toSeq}`

    for await (const msg of this.imapClient.fetch(range, { uid: true, envelope: true, source: true })) {
      if (!msg.envelope.from?.length) {
        logger.warn('email with no from address, skipping')
        continue
      }

      const textContent = this.extractTextFromSource(msg.source)
      const from = msg.envelope.from[0]

      const incomingMessage: IncomingMessage = {
        id: String(msg.uid),
        platform: 'email',
        channelId: from.address,
        senderId: from.address,
        senderName: from.name,
        text: textContent,
        timestamp: msg.envelope.date,
        raw: msg,
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

  private extractTextFromSource(source: Buffer): string {
    const raw = source.toString('utf-8')
    const headerBodySplit = raw.indexOf('\r\n\r\n')
    if (headerBodySplit === -1)
      return raw
    return raw.slice(headerBodySplit + 4).trim()
  }
}

function isExistsEvent(data: unknown): data is { path: string, count: number, prevCount: number } {
  if (typeof data !== 'object' || data === null)
    return false
  const d = data as Record<string, unknown>
  return typeof d.path === 'string' && typeof d.count === 'number' && typeof d.prevCount === 'number'
}
