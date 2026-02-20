export type ChannelStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export type ChannelPlatform = 'whatsapp' | 'slack' | 'email' | 'feishu' | 'dingtalk'

export interface MessageContent {
  text: string
}

export interface IncomingMessage {
  id: string
  platform: ChannelPlatform
  channelId: string
  senderId: string
  senderName?: string
  text: string
  timestamp: Date
  raw?: unknown
}

export type MessageHandler = (message: IncomingMessage) => void | Promise<void>

export interface Channel {
  readonly platform: ChannelPlatform
  readonly status: ChannelStatus

  connect: () => Promise<void>
  disconnect: () => Promise<void>
  sendMessage: (target: string, content: MessageContent) => Promise<void>
  onMessage: (handler: MessageHandler) => () => void
}

export interface WhatsAppConfig {
  platform: 'whatsapp'
  authDir: string
  rateLimitPerMinute?: number
}

export interface SlackConfig {
  platform: 'slack'
  botToken: string
  appToken: string
  socketMode?: boolean
}

export interface EmailConfig {
  platform: 'email'
  imap: {
    host: string
    port: number
    secure: boolean
    auth: { user: string, pass: string }
  }
  smtp: {
    host: string
    port: number
    secure: boolean
    auth: { user: string, pass: string }
  }
  fromAddress: string
  mailbox?: string
}

export interface FeishuConfig {
  platform: 'feishu'
  appId: string
  appSecret: string
  receiveIdType?: 'chat_id' | 'open_id' | 'user_id'
}

export interface DingTalkConfig {
  platform: 'dingtalk'
  clientId: string
  clientSecret: string
}

export type ChannelConfig = WhatsAppConfig | SlackConfig | EmailConfig | FeishuConfig | DingTalkConfig

export interface ChannelRegistryEntry {
  channel: Channel
  config: ChannelConfig
  registeredAt: Date
}
