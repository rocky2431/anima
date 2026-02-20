export { ChannelRegistry } from './channel-registry.js'

export type { ChannelOperationResult } from './channel-registry.js'
export { SlackChannel } from './slack/index.js'

export type { SlackChannelDeps } from './slack/index.js'
export type {
  Channel,
  ChannelConfig,
  ChannelPlatform,
  ChannelRegistryEntry,
  ChannelStatus,
  IncomingMessage,
  MessageContent,
  MessageHandler,
  SlackConfig,
  WhatsAppConfig,
} from './types.js'

export { WhatsAppChannel } from './whatsapp/index.js'
export type { WhatsAppChannelDeps } from './whatsapp/index.js'
