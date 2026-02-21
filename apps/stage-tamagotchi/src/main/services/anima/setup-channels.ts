import { env } from 'node:process'

import { useLogg } from '@guiiai/logg'
import { ChannelRegistry, SlackChannel } from '@proj-airi/channels-extra'

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
 *   (Future: AIRI_WHATSAPP_AUTH_DIR → WhatsApp, AIRI_EMAIL_* → Email, etc.)
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
