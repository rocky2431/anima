import type { EmailConfig } from '../../types.js'

import { describe, expect, it, vi } from 'vitest'

import { EmailChannel } from '../../email/index.js'

// Test Double rationale: imapflow + nodemailer are external services requiring real
// IMAP/SMTP servers with credentials. Cannot be tested with real infrastructure in CI.
// We verify the integration contract by testing that EmailChannel correctly delegates
// to imapflow/nodemailer APIs.

describe('emailChannel', () => {
  const config: EmailConfig = {
    platform: 'email',
    imap: {
      host: 'imap.example.com',
      port: 993,
      secure: true,
      auth: { user: 'test@example.com', pass: 'password' },
    },
    smtp: {
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      auth: { user: 'test@example.com', pass: 'password' },
    },
    fromAddress: 'test@example.com',
  }

  it('should have platform set to email', () => {
    const channel = new EmailChannel(config)
    expect(channel.platform).toBe('email')
  })

  it('should start with disconnected status', () => {
    const channel = new EmailChannel(config)
    expect(channel.status).toBe('disconnected')
  })

  it('should transition to connecting then connected on connect', async () => {
    const channel = new EmailChannel(config, {
      createImapClient: () => createMockImapClient(),
      createSmtpTransport: () => createMockSmtpTransport(),
    })

    const statuses: string[] = []
    channel.onStatusChange(s => statuses.push(s))

    await channel.connect()

    expect(statuses).toContain('connecting')
    expect(channel.status).toBe('connected')
  })

  it('should transition to disconnected on disconnect', async () => {
    const mockImap = createMockImapClient()
    const channel = new EmailChannel(config, {
      createImapClient: () => mockImap,
      createSmtpTransport: () => createMockSmtpTransport(),
    })

    await channel.connect()
    await channel.disconnect()

    expect(channel.status).toBe('disconnected')
    expect(mockImap.logout).toHaveBeenCalled()
  })

  it('should send message via SMTP transporter', async () => {
    const sendMailFn = vi.fn().mockResolvedValue({ messageId: '<test@example.com>' })
    const channel = new EmailChannel(config, {
      createImapClient: () => createMockImapClient(),
      createSmtpTransport: () => createMockSmtpTransport({ sendMail: sendMailFn }),
    })

    await channel.connect()
    await channel.sendMessage('recipient@example.com', { text: 'Hello from Email!' })

    expect(sendMailFn).toHaveBeenCalledWith(expect.objectContaining({
      from: 'test@example.com',
      to: 'recipient@example.com',
      text: 'Hello from Email!',
    }))
  })

  it('should receive messages via IMAP and invoke handler', async () => {
    const mockImap = createMockImapClient()
    const channel = new EmailChannel(config, {
      createImapClient: () => mockImap,
      createSmtpTransport: () => createMockSmtpTransport(),
    })

    await channel.connect()

    const received: Array<{ text: string }> = []
    channel.onMessage((msg) => { received.push({ text: msg.text }) })

    mockImap._simulateNewEmail({
      uid: 42,
      from: 'sender@example.com',
      fromName: 'Sender',
      subject: 'Test Subject',
      text: 'Hello from IMAP!',
      date: new Date('2026-02-21T00:00:00Z'),
    })

    // Allow async handler to process
    await new Promise(resolve => setTimeout(resolve, 10))

    expect(received).toHaveLength(1)
    expect(received[0].text).toBe('Hello from IMAP!')
  })

  it('should unsubscribe message handler', async () => {
    const mockImap = createMockImapClient()
    const channel = new EmailChannel(config, {
      createImapClient: () => mockImap,
      createSmtpTransport: () => createMockSmtpTransport(),
    })

    await channel.connect()

    const received: string[] = []
    const unsub = channel.onMessage((msg) => { received.push(msg.text) })
    unsub()

    mockImap._simulateNewEmail({
      uid: 1,
      from: 'sender@example.com',
      subject: 'Test',
      text: 'Should not be received',
      date: new Date(),
    })

    await new Promise(resolve => setTimeout(resolve, 10))

    expect(received).toHaveLength(0)
  })

  it('should throw when sending before connect', async () => {
    const channel = new EmailChannel(config)

    await expect(
      channel.sendMessage('recipient@example.com', { text: 'fail' }),
    ).rejects.toThrow(/sendMessage failed/i)
  })

  it('should throw when connecting without deps', async () => {
    const channel = new EmailChannel(config)

    await expect(channel.connect()).rejects.toThrow(/requires.*dependency/i)
    expect(channel.status).toBe('error')
  })

  it('should use custom mailbox when configured', async () => {
    const mockImap = createMockImapClient()
    const customConfig: EmailConfig = { ...config, mailbox: 'Archive' }
    const channel = new EmailChannel(customConfig, {
      createImapClient: () => mockImap,
      createSmtpTransport: () => createMockSmtpTransport(),
    })

    await channel.connect()

    expect(mockImap.getMailboxLock).toHaveBeenCalledWith('Archive')
  })

  it('should default to INBOX mailbox', async () => {
    const mockImap = createMockImapClient()
    const channel = new EmailChannel(config, {
      createImapClient: () => mockImap,
      createSmtpTransport: () => createMockSmtpTransport(),
    })

    await channel.connect()

    expect(mockImap.getMailboxLock).toHaveBeenCalledWith('INBOX')
  })

  it('should throw when SMTP send fails', async () => {
    const sendMailFn = vi.fn().mockRejectedValue(new Error('SMTP timeout'))
    const channel = new EmailChannel(config, {
      createImapClient: () => createMockImapClient(),
      createSmtpTransport: () => createMockSmtpTransport({ sendMail: sendMailFn }),
    })

    await channel.connect()

    await expect(
      channel.sendMessage('recipient@example.com', { text: 'fail' }),
    ).rejects.toThrow(/Email send to recipient@example.com failed/i)
  })

  it('should set error status when connect fails', async () => {
    const channel = new EmailChannel(config, {
      createImapClient: () => { throw new Error('IMAP connection refused') },
      createSmtpTransport: () => createMockSmtpTransport(),
    })

    await expect(channel.connect()).rejects.toThrow(/connect failed/i)
    expect(channel.status).toBe('error')
  })

  it('should handle disconnect errors and set error status', async () => {
    const mockImap = createMockImapClient()
    ;(mockImap.logout as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('logout failed'))
    const channel = new EmailChannel(config, {
      createImapClient: () => mockImap,
      createSmtpTransport: () => createMockSmtpTransport(),
    })

    await channel.connect()

    await expect(channel.disconnect()).rejects.toThrow(/disconnect failed/i)
    expect(channel.status).toBe('error')
  })
})

interface SimulatedEmail {
  uid: number
  from: string
  fromName?: string
  subject: string
  text: string
  date: Date
}

interface MockImapClient {
  connect: (() => Promise<void>) & { mock: unknown }
  logout: (() => Promise<void>) & { mock: unknown }
  getMailboxLock: ((mailbox: string) => Promise<{ release: () => void }>) & { mock: unknown }
  on: (event: string, handler: (...args: unknown[]) => void) => void
  off: (event: string, handler: (...args: unknown[]) => void) => void
  fetch: ((range: string, options: Record<string, boolean>) => AsyncIterable<MockFetchMessage>) & { mock: unknown }
  _simulateNewEmail: (email: SimulatedEmail) => void
  _eventHandlers: Map<string, Array<(...args: unknown[]) => void>>
}

interface MockFetchMessage {
  uid: number
  envelope: {
    from: Array<{ name: string, address: string }>
    subject: string
    date: Date
  }
  source: Buffer
}

interface MockSmtpTransport {
  sendMail: ((options: Record<string, unknown>) => Promise<{ messageId: string }>) & { mock: unknown }
  verify: (() => Promise<boolean>) & { mock: unknown }
  close: (() => void) & { mock: unknown }
}

function createMockImapClient(): MockImapClient {
  const eventHandlers = new Map<string, Array<(...args: unknown[]) => void>>()
  let existsHandler: ((data: { path: string, count: number, prevCount: number }) => void) | null = null

  const mockClient: MockImapClient = {
    connect: vi.fn<() => Promise<void>>().mockResolvedValue(undefined) as MockImapClient['connect'],
    logout: vi.fn<() => Promise<void>>().mockResolvedValue(undefined) as MockImapClient['logout'],
    getMailboxLock: vi.fn<(mailbox: string) => Promise<{ release: () => void }>>()
      .mockResolvedValue({ release: vi.fn() }) as MockImapClient['getMailboxLock'],
    on(event: string, handler: (...args: unknown[]) => void) {
      if (!eventHandlers.has(event))
        eventHandlers.set(event, [])
      eventHandlers.get(event)!.push(handler)
      if (event === 'exists')
        existsHandler = handler as typeof existsHandler
    },
    off(event: string, handler: (...args: unknown[]) => void) {
      const handlers = eventHandlers.get(event)
      if (handlers) {
        const idx = handlers.indexOf(handler)
        if (idx >= 0)
          handlers.splice(idx, 1)
      }
    },
    fetch: vi.fn<(range: string, options: Record<string, boolean>) => AsyncIterable<MockFetchMessage>>()
      .mockImplementation(() => {
        return {
          async* [Symbol.asyncIterator]() {
            // Default: yield nothing
          },
        }
      }) as MockImapClient['fetch'],
    _simulateNewEmail(email: SimulatedEmail) {
      // Override fetch to return this email
      const emailSource = Buffer.from(
        `From: ${email.fromName ?? email.from} <${email.from}>\r\n`
        + `Subject: ${email.subject}\r\n`
        + `Date: ${email.date.toUTCString()}\r\n\r\n`
        + `${email.text}`,
      )

      const fetchMsg: MockFetchMessage = {
        uid: email.uid,
        envelope: {
          from: [{ name: email.fromName ?? '', address: email.from }],
          subject: email.subject,
          date: email.date,
        },
        source: emailSource,
      }

      mockClient.fetch = vi.fn().mockImplementation(() => {
        return {
          async* [Symbol.asyncIterator]() {
            yield fetchMsg
          },
        }
      }) as MockImapClient['fetch']

      // Trigger the exists event
      if (existsHandler) {
        existsHandler({ path: 'INBOX', count: 1, prevCount: 0 })
      }
    },
    _eventHandlers: eventHandlers,
  }

  return mockClient
}

function createMockSmtpTransport(
  overrides: Partial<{ sendMail: (options: Record<string, unknown>) => Promise<{ messageId: string }> }> = {},
): MockSmtpTransport {
  return {
    sendMail: (overrides.sendMail ?? vi.fn().mockResolvedValue({ messageId: '<test@example.com>' })) as MockSmtpTransport['sendMail'],
    verify: vi.fn<() => Promise<boolean>>().mockResolvedValue(true) as MockSmtpTransport['verify'],
    close: vi.fn() as MockSmtpTransport['close'],
  }
}
