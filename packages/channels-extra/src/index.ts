export { ChannelRegistry } from './channel-registry.js'

export type { ChannelOperationResult } from './channel-registry.js'

export { DingTalkChannel } from './dingtalk/index.js'
export type { DingTalkChannelDeps } from './dingtalk/index.js'

export { EmailChannel } from './email/index.js'
export type { EmailChannelDeps } from './email/index.js'

export { FeishuChannel } from './feishu/index.js'
export type { FeishuChannelDeps } from './feishu/index.js'

export { SlackChannel } from './slack/index.js'
export type { SlackChannelDeps } from './slack/index.js'

export type {
  Channel,
  ChannelConfig,
  ChannelPlatform,
  ChannelRegistryEntry,
  ChannelStatus,
  DingTalkConfig,
  EmailConfig,
  FeishuConfig,
  IncomingMessage,
  MessageContent,
  MessageHandler,
  SlackConfig,
  WhatsAppConfig,
} from './types.js'

export { WhatsAppChannel } from './whatsapp/index.js'
export type { WhatsAppChannelDeps } from './whatsapp/index.js'
