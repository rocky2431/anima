import { env } from 'node:process'

import { useLogg } from '@guiiai/logg'
import { ChannelRegistry, DingTalkChannel, EmailChannel, FeishuChannel, SlackChannel, WhatsAppChannel } from '@proj-airi/channels-extra'

const log = useLogg('channels-setup').useGlobalConfig()

export interface ChannelsHandle {
  registry: ChannelRegistry
  stop: () => Promise<void>
}

/**
 * Initialize external messaging channels (Slack, WhatsApp, Email, etc.).
 *
 * Reads configuration from environment variables. Only channels with complete
 * configuration are registered. Missing config is logged and skipped gracefully.
 *
 * Env vars:
 *   AIRI_SLACK_BOT_TOKEN + AIRI_SLACK_APP_TOKEN → Slack channel
 *   AIRI_WHATSAPP_AUTH_DIR → WhatsApp channel
 *   AIRI_EMAIL_IMAP_HOST + AIRI_EMAIL_SMTP_HOST + AIRI_EMAIL_USER + AIRI_EMAIL_PASS + AIRI_EMAIL_FROM → Email channel
 *   AIRI_FEISHU_APP_ID + AIRI_FEISHU_APP_SECRET → Feishu channel
 *   AIRI_DINGTALK_CLIENT_ID + AIRI_DINGTALK_CLIENT_SECRET → DingTalk channel
 */
export async function setupChannels(): Promise<ChannelsHandle> {
  const registry = new ChannelRegistry()
  let unsubMessages: (() => void) | null = null

  // --- Slack ---
  const slackBotToken = env.AIRI_SLACK_BOT_TOKEN
  const slackAppToken = env.AIRI_SLACK_APP_TOKEN
  if (slackBotToken && slackAppToken) {
    try {
      const { App } = await import('@slack/bolt')
      const channel = new SlackChannel(
        { platform: 'slack', botToken: slackBotToken, appToken: slackAppToken, socketMode: true },
        {
          createApp: () => new App({
            token: slackBotToken,
            appToken: slackAppToken,
            socketMode: true,
          }) as any,
        },
      )
      registry.register(channel, { platform: 'slack', botToken: slackBotToken, appToken: slackAppToken, socketMode: true })
      log.info('Slack channel registered')
    }
    catch (err) {
      log.withError(err instanceof Error ? err : new Error(String(err))).warn('Failed to register Slack channel')
    }
  }
  else {
    log.info('Slack channel skipped (set AIRI_SLACK_BOT_TOKEN + AIRI_SLACK_APP_TOKEN)')
  }

  // --- WhatsApp ---
  const whatsappAuthDir = env.AIRI_WHATSAPP_AUTH_DIR
  if (whatsappAuthDir) {
    try {
      const channel = new WhatsAppChannel({ platform: 'whatsapp', authDir: whatsappAuthDir })
      registry.register(channel, { platform: 'whatsapp', authDir: whatsappAuthDir })
      log.info('WhatsApp channel registered')
    }
    catch (err) {
      log.withError(err instanceof Error ? err : new Error(String(err))).warn('Failed to register WhatsApp channel')
    }
  }
  else {
    log.info('WhatsApp channel skipped (set AIRI_WHATSAPP_AUTH_DIR)')
  }

  // --- Email ---
  const emailImapHost = env.AIRI_EMAIL_IMAP_HOST
  const emailSmtpHost = env.AIRI_EMAIL_SMTP_HOST
  const emailUser = env.AIRI_EMAIL_USER
  const emailPass = env.AIRI_EMAIL_PASS
  const emailFrom = env.AIRI_EMAIL_FROM
  if (emailImapHost && emailSmtpHost && emailUser && emailPass && emailFrom) {
    try {
      const config = {
        platform: 'email' as const,
        imap: { host: emailImapHost, port: Number(env.AIRI_EMAIL_IMAP_PORT ?? '993'), secure: true, auth: { user: emailUser, pass: emailPass } },
        smtp: { host: emailSmtpHost, port: Number(env.AIRI_EMAIL_SMTP_PORT ?? '465'), secure: true, auth: { user: emailUser, pass: emailPass } },
        fromAddress: emailFrom,
      }
      const channel = new EmailChannel(config)
      registry.register(channel, config)
      log.info('Email channel registered')
    }
    catch (err) {
      log.withError(err instanceof Error ? err : new Error(String(err))).warn('Failed to register Email channel')
    }
  }
  else {
    log.info('Email channel skipped (set AIRI_EMAIL_IMAP_HOST + AIRI_EMAIL_SMTP_HOST + AIRI_EMAIL_USER + AIRI_EMAIL_PASS + AIRI_EMAIL_FROM)')
  }

  // --- Feishu ---
  const feishuAppId = env.AIRI_FEISHU_APP_ID
  const feishuAppSecret = env.AIRI_FEISHU_APP_SECRET
  if (feishuAppId && feishuAppSecret) {
    try {
      const config = { platform: 'feishu' as const, appId: feishuAppId, appSecret: feishuAppSecret }
      const channel = new FeishuChannel(config)
      registry.register(channel, config)
      log.info('Feishu channel registered')
    }
    catch (err) {
      log.withError(err instanceof Error ? err : new Error(String(err))).warn('Failed to register Feishu channel')
    }
  }
  else {
    log.info('Feishu channel skipped (set AIRI_FEISHU_APP_ID + AIRI_FEISHU_APP_SECRET)')
  }

  // --- DingTalk ---
  const dingtalkClientId = env.AIRI_DINGTALK_CLIENT_ID
  const dingtalkClientSecret = env.AIRI_DINGTALK_CLIENT_SECRET
  if (dingtalkClientId && dingtalkClientSecret) {
    try {
      const config = { platform: 'dingtalk' as const, clientId: dingtalkClientId, clientSecret: dingtalkClientSecret }
      const channel = new DingTalkChannel(config)
      registry.register(channel, config)
      log.info('DingTalk channel registered')
    }
    catch (err) {
      log.withError(err instanceof Error ? err : new Error(String(err))).warn('Failed to register DingTalk channel')
    }
  }
  else {
    log.info('DingTalk channel skipped (set AIRI_DINGTALK_CLIENT_ID + AIRI_DINGTALK_CLIENT_SECRET)')
  }

  // --- Global message handler ---
  unsubMessages = registry.onAnyMessage((msg) => {
    log.withFields({
      platform: msg.platform,
      senderId: msg.senderId,
      senderName: msg.senderName,
      textLength: msg.text.length,
    }).info('Incoming channel message')
  })

  // --- Connect all registered channels ---
  const results = await registry.connectAll()
  for (const [platform, result] of results) {
    if (result.success) {
      log.withFields({ platform }).info('Channel connected')
    }
    else {
      log.withFields({ platform }).withError(result.error!).warn('Channel connection failed')
    }
  }

  const channelCount = registry.listAll().length
  log.withFields({ channelCount }).info('Channels setup complete')

  return {
    registry,
    async stop() {
      unsubMessages?.()
      await registry.disconnectAll()
      log.info('All channels disconnected')
    },
  }
}
