import { env } from 'node:process'

import { useLogg } from '@guiiai/logg'
import { ChannelRegistry, DingTalkChannel, EmailChannel, FeishuChannel, SlackChannel, WhatsAppChannel } from '@anase/channels-extra'

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
 *   ANASE_SLACK_BOT_TOKEN + ANASE_SLACK_APP_TOKEN → Slack channel
 *   ANASE_WHATSAPP_AUTH_DIR → WhatsApp channel
 *   ANASE_EMAIL_IMAP_HOST + ANASE_EMAIL_SMTP_HOST + ANASE_EMAIL_USER + ANASE_EMAIL_PASS + ANASE_EMAIL_FROM → Email channel
 *   ANASE_FEISHU_APP_ID + ANASE_FEISHU_APP_SECRET → Feishu channel
 *   ANASE_DINGTALK_CLIENT_ID + ANASE_DINGTALK_CLIENT_SECRET → DingTalk channel
 */
export async function setupChannels(): Promise<ChannelsHandle> {
  const registry = new ChannelRegistry()
  let unsubMessages: (() => void) | null = null

  // --- Slack ---
  const slackBotToken = env.ANASE_SLACK_BOT_TOKEN
  const slackAppToken = env.ANASE_SLACK_APP_TOKEN
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
      log.log('Slack channel registered')
    }
    catch (err) {
      log.withError(err instanceof Error ? err : new Error(String(err))).warn('Failed to register Slack channel')
    }
  }
  else {
    log.log('Slack channel skipped (set ANASE_SLACK_BOT_TOKEN + ANASE_SLACK_APP_TOKEN)')
  }

  // --- WhatsApp ---
  const whatsappAuthDir = env.ANASE_WHATSAPP_AUTH_DIR
  if (whatsappAuthDir) {
    try {
      const channel = new WhatsAppChannel({ platform: 'whatsapp', authDir: whatsappAuthDir })
      registry.register(channel, { platform: 'whatsapp', authDir: whatsappAuthDir })
      log.log('WhatsApp channel registered')
    }
    catch (err) {
      log.withError(err instanceof Error ? err : new Error(String(err))).warn('Failed to register WhatsApp channel')
    }
  }
  else {
    log.log('WhatsApp channel skipped (set ANASE_WHATSAPP_AUTH_DIR)')
  }

  // --- Email ---
  const emailImapHost = env.ANASE_EMAIL_IMAP_HOST
  const emailSmtpHost = env.ANASE_EMAIL_SMTP_HOST
  const emailUser = env.ANASE_EMAIL_USER
  const emailPass = env.ANASE_EMAIL_PASS
  const emailFrom = env.ANASE_EMAIL_FROM
  if (emailImapHost && emailSmtpHost && emailUser && emailPass && emailFrom) {
    try {
      const config = {
        platform: 'email' as const,
        imap: { host: emailImapHost, port: Number(env.ANASE_EMAIL_IMAP_PORT ?? '993'), secure: true, auth: { user: emailUser, pass: emailPass } },
        smtp: { host: emailSmtpHost, port: Number(env.ANASE_EMAIL_SMTP_PORT ?? '465'), secure: true, auth: { user: emailUser, pass: emailPass } },
        fromAddress: emailFrom,
      }
      const channel = new EmailChannel(config)
      registry.register(channel, config)
      log.log('Email channel registered')
    }
    catch (err) {
      log.withError(err instanceof Error ? err : new Error(String(err))).warn('Failed to register Email channel')
    }
  }
  else {
    log.log('Email channel skipped (set ANASE_EMAIL_IMAP_HOST + ANASE_EMAIL_SMTP_HOST + ANASE_EMAIL_USER + ANASE_EMAIL_PASS + ANASE_EMAIL_FROM)')
  }

  // --- Feishu ---
  const feishuAppId = env.ANASE_FEISHU_APP_ID
  const feishuAppSecret = env.ANASE_FEISHU_APP_SECRET
  if (feishuAppId && feishuAppSecret) {
    try {
      const config = { platform: 'feishu' as const, appId: feishuAppId, appSecret: feishuAppSecret }
      const channel = new FeishuChannel(config)
      registry.register(channel, config)
      log.log('Feishu channel registered')
    }
    catch (err) {
      log.withError(err instanceof Error ? err : new Error(String(err))).warn('Failed to register Feishu channel')
    }
  }
  else {
    log.log('Feishu channel skipped (set ANASE_FEISHU_APP_ID + ANASE_FEISHU_APP_SECRET)')
  }

  // --- DingTalk ---
  const dingtalkClientId = env.ANASE_DINGTALK_CLIENT_ID
  const dingtalkClientSecret = env.ANASE_DINGTALK_CLIENT_SECRET
  if (dingtalkClientId && dingtalkClientSecret) {
    try {
      const config = { platform: 'dingtalk' as const, clientId: dingtalkClientId, clientSecret: dingtalkClientSecret }
      const channel = new DingTalkChannel(config)
      registry.register(channel, config)
      log.log('DingTalk channel registered')
    }
    catch (err) {
      log.withError(err instanceof Error ? err : new Error(String(err))).warn('Failed to register DingTalk channel')
    }
  }
  else {
    log.log('DingTalk channel skipped (set ANASE_DINGTALK_CLIENT_ID + ANASE_DINGTALK_CLIENT_SECRET)')
  }

  // --- Global message handler ---
  unsubMessages = registry.onAnyMessage((msg) => {
    log.withFields({
      platform: msg.platform,
      senderId: msg.senderId,
      senderName: msg.senderName,
      textLength: msg.text.length,
    }).log('Incoming channel message')
  })

  // --- Connect all registered channels ---
  const results = await registry.connectAll()
  for (const [platform, result] of results) {
    if (result.success) {
      log.withFields({ platform }).log('Channel connected')
    }
    else {
      log.withFields({ platform }).withError(result.error!).warn('Channel connection failed')
    }
  }

  const channelCount = registry.listAll().length
  log.withFields({ channelCount }).log('Channels setup complete')

  return {
    registry,
    async stop() {
      unsubMessages?.()
      await registry.disconnectAll()
      log.log('All channels disconnected')
    },
  }
}
