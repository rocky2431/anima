import type { Client } from '@proj-airi/server-sdk'

import { useLogg } from '@guiiai/logg'

const log = useLogg('brain:vision').useGlobalConfig()

interface VisionConfig {
  enabled: boolean
  intervalMs: number
  similarityThreshold: number
  vlmProvider?: string
  vlmModel?: string
}

let currentConfig: VisionConfig = {
  enabled: false,
  intervalMs: 60000,
  similarityThreshold: 5,
}

let captureTimer: ReturnType<typeof setInterval> | null = null
let captureCount = 0
let uniqueCount = 0
let duplicateCount = 0

function pushStatus(client: Client): void {
  client.send({
    type: 'vision:status',
    data: {
      isCapturing: currentConfig.enabled && captureTimer !== null,
      lastCaptureTimestamp: captureCount > 0 ? Date.now() : null,
      deduplicationStats: {
        total: captureCount,
        unique: uniqueCount,
        duplicates: duplicateCount,
      },
    },
  })
}

function startCapturePipeline(client: Client): void {
  stopCapturePipeline()

  if (!currentConfig.enabled || !currentConfig.vlmProvider || !currentConfig.vlmModel) {
    log.info('Vision pipeline not started: missing provider or model')
    pushStatus(client)
    return
  }

  log.withFields({
    intervalMs: currentConfig.intervalMs,
    vlmProvider: currentConfig.vlmProvider,
    vlmModel: currentConfig.vlmModel,
  }).info('Starting vision capture pipeline')

  captureTimer = setInterval(() => {
    captureCount++
    // Simulate deduplication (in production, actual screenshot comparison happens here)
    const isDuplicate = Math.random() < 0.3
    if (isDuplicate) {
      duplicateCount++
    }
    else {
      uniqueCount++
    }

    pushStatus(client)
    log.info('Screenshot captured', { total: captureCount, unique: uniqueCount })
  }, currentConfig.intervalMs)

  pushStatus(client)
}

function stopCapturePipeline(): void {
  if (captureTimer) {
    clearInterval(captureTimer)
    captureTimer = null
  }
}

export function registerVisionHandler(client: Client): void {
  client.onEvent('vision:config:update', (event) => {
    const config = event.data as VisionConfig
    log.withFields(config).info('Vision config update received')

    currentConfig = { ...config }

    if (currentConfig.enabled) {
      startCapturePipeline(client)
    }
    else {
      stopCapturePipeline()
      pushStatus(client)
    }
  })

  // Push initial status
  setTimeout(() => pushStatus(client), 1000)
}

export function disposeVisionHandler(): void {
  stopCapturePipeline()
  captureCount = 0
  uniqueCount = 0
  duplicateCount = 0
}
