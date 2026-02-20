import type { Channel, ChannelConfig, ChannelPlatform, ChannelRegistryEntry, IncomingMessage, MessageHandler } from './types.js'

import { useLogg } from '@guiiai/logg'

const logger = useLogg('channels-extra:registry')

export interface ChannelOperationResult {
  success: boolean
  error?: Error
}

/**
 * Manages multiple Channel instances by platform.
 *
 * State is intentionally ephemeral (in-memory) — channels are re-registered
 * by DI on each application boot. Config persistence is the caller's concern.
 */
export class ChannelRegistry {
  private entries = new Map<ChannelPlatform, ChannelRegistryEntry>()
  private globalHandlers: MessageHandler[] = []

  /** Register a channel. Throws if platform already registered. */
  register(channel: Channel, config: ChannelConfig): void {
    if (channel.platform !== config.platform) {
      throw new Error(
        `Channel platform "${channel.platform}" does not match config platform "${config.platform}"`,
      )
    }

    if (this.entries.has(channel.platform)) {
      throw new Error(`Channel for platform "${channel.platform}" is already registered`)
    }

    this.entries.set(channel.platform, {
      channel,
      config,
      registeredAt: new Date(),
    })

    channel.onMessage((msg: IncomingMessage) => {
      for (const handler of this.globalHandlers) {
        try {
          const result = handler(msg)
          if (result instanceof Promise) {
            result.catch(err => logger.withFields({ platform: msg.platform }).withError(err as Error).error('async global handler error'))
          }
        }
        catch (err) {
          logger.withFields({ platform: msg.platform }).withError(err as Error).error('sync global handler error')
        }
      }
    })

    logger.log(`channel registered: ${channel.platform}`)
  }

  unregister(platform: ChannelPlatform): void {
    this.entries.delete(platform)
    logger.log(`channel unregistered: ${platform}`)
  }

  /** Returns a readonly snapshot. Callers cannot mutate internal state. */
  getByPlatform(platform: ChannelPlatform): Readonly<ChannelRegistryEntry> | undefined {
    const entry = this.entries.get(platform)
    if (!entry)
      return undefined
    return { ...entry }
  }

  listAll(): ReadonlyArray<Readonly<ChannelRegistryEntry>> {
    return [...this.entries.values()].map(e => ({ ...e }))
  }

  /** Connect all channels. One failure does not prevent others. */
  async connectAll(): Promise<Map<ChannelPlatform, ChannelOperationResult>> {
    return this.executeOnAll(ch => ch.connect())
  }

  /** Disconnect all channels. One failure does not prevent others. */
  async disconnectAll(): Promise<Map<ChannelPlatform, ChannelOperationResult>> {
    return this.executeOnAll(ch => ch.disconnect())
  }

  /** Subscribe to messages from all channels. Returns unsubscribe function. */
  onAnyMessage(handler: MessageHandler): () => void {
    this.globalHandlers.push(handler)
    return () => {
      const idx = this.globalHandlers.indexOf(handler)
      if (idx >= 0)
        this.globalHandlers.splice(idx, 1)
    }
  }

  private async executeOnAll(
    operation: (ch: Channel) => Promise<void>,
  ): Promise<Map<ChannelPlatform, ChannelOperationResult>> {
    const results = new Map<ChannelPlatform, ChannelOperationResult>()

    const promises = [...this.entries.entries()].map(async ([platform, entry]) => {
      try {
        await operation(entry.channel)
        results.set(platform, { success: true })
      }
      catch (error) {
        const err = error instanceof Error ? error : new Error(String(error))
        logger.withError(err).error(`channel operation failed: ${platform}`)
        results.set(platform, { success: false, error: err })
      }
    })

    await Promise.all(promises)
    return results
  }
}
