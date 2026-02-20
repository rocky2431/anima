export type ChannelStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export type ChannelPlatform = 'whatsapp' | 'slack'

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

export type ChannelConfig = WhatsAppConfig | SlackConfig

export interface ChannelRegistryEntry {
  channel: Channel
  config: ChannelConfig
  registeredAt: Date
}
