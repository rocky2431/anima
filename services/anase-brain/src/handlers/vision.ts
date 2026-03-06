import type { Client } from '@anase/server-sdk'

import type { BrainStore, VisionConfig } from '../store'

import { useLogg } from '@guiiai/logg'

const log = useLogg('brain:vision').useGlobalConfig()

let captureTimer: ReturnType<typeof setInterval> | null = null
let brainStoreRef: BrainStore | null = null

function pushStatus(client: Client, brainStore: BrainStore, config: VisionConfig): void {
  const stats = brainStore.getVisionStats()
  client.send({
    type: 'vision:status',
    data: {
      isCapturing: config.enabled && captureTimer !== null,
      lastCaptureTimestamp: stats.total > 0 ? Date.now() : null,
      deduplicationStats: {
        total: stats.total,
        unique: stats.uniqueCount,
        duplicates: stats.duplicates,
      },
    },
  })
}

function startCapturePipeline(client: Client, brainStore: BrainStore, config: VisionConfig): void {
  stopCapturePipeline()

  if (!config.enabled || !config.vlmProvider || !config.vlmModel) {
    log.log('Vision pipeline not started: missing provider or model')
    pushStatus(client, brainStore, config)
    return
  }

  log.withFields({
    intervalMs: config.intervalMs,
    vlmProvider: config.vlmProvider,
    vlmModel: config.vlmModel,
  }).log('Starting vision capture pipeline')

  captureTimer = setInterval(() => {
    const stats = brainStore.getVisionStats()
    // In production: actual screenshot → pHash → dedup → VLM describe
    // For now: increment total, mark as unique (pipeline placeholder)
    brainStore.updateVisionStats({
      total: stats.total + 1,
      uniqueCount: stats.uniqueCount + 1,
      duplicates: stats.duplicates,
    })
    pushStatus(client, brainStore, config)
    log.log('Screenshot pipeline tick', { total: stats.total + 1 })
  }, config.intervalMs)

  pushStatus(client, brainStore, config)
}

function stopCapturePipeline(): void {
  if (captureTimer) {
    clearInterval(captureTimer)
    captureTimer = null
  }
}

export function registerVisionHandler(client: Client, brainStore: BrainStore): void {
  brainStoreRef = brainStore

  // Load persisted config
  const config = brainStore.getVisionConfig()

  client.onEvent('vision:config:update', (event) => {
    const newConfig = event.data as VisionConfig
    log.withFields(newConfig).log('Vision config update received')

    brainStore.setVisionConfig(newConfig)

    if (newConfig.enabled) {
      startCapturePipeline(client, brainStore, newConfig)
    }
    else {
      stopCapturePipeline()
      pushStatus(client, brainStore, newConfig)
    }
  })

  // Push initial status
  setTimeout(() => pushStatus(client, brainStore, config), 1000)

  // Start pipeline if it was previously enabled
  if (config.enabled) {
    startCapturePipeline(client, brainStore, config)
  }
}

export function disposeVisionHandler(): void {
  stopCapturePipeline()
  if (brainStoreRef) {
    // Stats are already persisted on each tick, no final write needed
    brainStoreRef = null
  }
}
