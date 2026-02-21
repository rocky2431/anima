import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { ref } from 'vue'

import { useModsServerChannelStore } from '../mods/api/channel-server'

export interface VisionDeduplicationStats {
  total: number
  unique: number
  duplicates: number
}

export const useVisionStore = defineStore('vision-module', () => {
  // Persisted config (localStorage)
  const enabled = useLocalStorage('settings/vision/enabled', false)
  const intervalMs = useLocalStorage('settings/vision/interval-ms', 60000)
  const similarityThreshold = useLocalStorage('settings/vision/similarity-threshold', 5)
  const vlmProvider = useLocalStorage('settings/vision/vlm-provider', '')
  const vlmModel = useLocalStorage('settings/vision/vlm-model', '')

  // Runtime state
  const isCapturing = ref(false)
  const lastCaptureTimestamp = ref<number | null>(null)
  const deduplicationStats = ref<VisionDeduplicationStats>({ total: 0, unique: 0, duplicates: 0 })
  const disposers = ref<Array<() => void>>([])

  const configured = ref(false)

  function updateConfigured(): void {
    configured.value = enabled.value && !!vlmProvider.value && !!vlmModel.value
  }

  function sendConfigUpdate(): void {
    const serverChannel = useModsServerChannelStore()
    serverChannel.send({
      type: 'vision:config:update',
      data: {
        enabled: enabled.value,
        intervalMs: intervalMs.value,
        similarityThreshold: similarityThreshold.value,
        vlmProvider: vlmProvider.value || undefined,
        vlmModel: vlmModel.value || undefined,
      },
    })
    updateConfigured()
  }

  function initialize(): void {
    const serverChannel = useModsServerChannelStore()

    disposers.value.push(
      serverChannel.onEvent('vision:status', (event) => {
        const { isCapturing: capturing, lastCaptureTimestamp: ts, deduplicationStats: stats } = event.data
        isCapturing.value = capturing
        lastCaptureTimestamp.value = ts
        deduplicationStats.value = { ...stats }
      }),
    )

    updateConfigured()

    // Push current config to brain on init
    if (enabled.value) {
      sendConfigUpdate()
    }
  }

  function dispose(): void {
    for (const d of disposers.value) {
      d()
    }
    disposers.value = []
  }

  function resetState(): void {
    enabled.value = false
    intervalMs.value = 60000
    similarityThreshold.value = 5
    vlmProvider.value = ''
    vlmModel.value = ''
    isCapturing.value = false
    lastCaptureTimestamp.value = null
    deduplicationStats.value = { total: 0, unique: 0, duplicates: 0 }
    configured.value = false
  }

  return {
    // Config
    enabled,
    intervalMs,
    similarityThreshold,
    vlmProvider,
    vlmModel,
    configured,

    // Runtime
    isCapturing,
    lastCaptureTimestamp,
    deduplicationStats,

    // Actions
    sendConfigUpdate,
    initialize,
    dispose,
    resetState,
  }
})
