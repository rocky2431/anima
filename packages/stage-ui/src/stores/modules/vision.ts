import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { useModsServerChannelStore } from '../mods/api/channel-server'
import { resolveLegacyId } from '../providers-adapter'
import { unifiedProviders } from '../providers/unified'
import { useConsciousnessStore } from './consciousness'

export interface VisionDeduplicationStats {
  total: number
  unique: number
  duplicates: number
}

export const useVisionStore = defineStore('vision-module', () => {
  const consciousnessStore = useConsciousnessStore()

  // Persisted config (localStorage)
  const enabled = useLocalStorage('settings/vision/enabled', false)
  const intervalMs = useLocalStorage('settings/vision/interval-ms', 60000)
  const similarityThreshold = useLocalStorage('settings/vision/similarity-threshold', 5)
  const vlmProvider = useLocalStorage('settings/vision/vlm-provider', '')
  const vlmModel = useLocalStorage('settings/vision/vlm-model', '')

  /**
   * When true, vision reuses the consciousness provider/model instead of
   * requiring a separate VLM selection.  Most OpenRouter models (GPT-4o,
   * Claude, Gemini) natively support vision, so a dedicated VLM is
   * usually unnecessary.
   */
  const useConsciousnessProvider = useLocalStorage('settings/vision/use-consciousness-provider', true)

  /**
   * Whether the current consciousness provider supports vision.
   * Resolved through the unified provider registry via the legacy adapter.
   */
  const consciousnessSupportsVision = computed(() => {
    const legacyId = consciousnessStore.activeProvider
    if (!legacyId)
      return false

    const mapping = resolveLegacyId(legacyId)
    const unifiedId = mapping?.unifiedId || legacyId
    const meta = unifiedProviders[unifiedId]
    return meta?.capabilities.vision ?? false
  })

  /** Resolved provider ID sent to the backend. */
  const effectiveVlmProvider = computed(() => {
    if (useConsciousnessProvider.value && consciousnessSupportsVision.value)
      return consciousnessStore.activeProvider
    return vlmProvider.value
  })

  /** Resolved model ID sent to the backend. */
  const effectiveVlmModel = computed(() => {
    if (useConsciousnessProvider.value && consciousnessSupportsVision.value)
      return consciousnessStore.activeModel
    return vlmModel.value
  })

  // Runtime state
  const isCapturing = ref(false)
  const lastCaptureTimestamp = ref<number | null>(null)
  const deduplicationStats = ref<VisionDeduplicationStats>({ total: 0, unique: 0, duplicates: 0 })
  const disposers = ref<Array<() => void>>([])

  const configured = ref(false)

  function updateConfigured(): void {
    if (useConsciousnessProvider.value) {
      // When reusing consciousness, vision is configured if consciousness is and supports vision
      configured.value = enabled.value && consciousnessStore.configured && consciousnessSupportsVision.value
    }
    else {
      configured.value = enabled.value && !!vlmProvider.value && !!vlmModel.value
    }
  }

  function sendConfigUpdate(): void {
    const serverChannel = useModsServerChannelStore()
    serverChannel.send({
      type: 'vision:config:update',
      data: {
        enabled: enabled.value,
        intervalMs: intervalMs.value,
        similarityThreshold: similarityThreshold.value,
        vlmProvider: effectiveVlmProvider.value || undefined,
        vlmModel: effectiveVlmModel.value || undefined,
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
    useConsciousnessProvider.value = true
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
    useConsciousnessProvider,
    configured,

    // Computed — consciousness reuse
    consciousnessSupportsVision,
    effectiveVlmProvider,
    effectiveVlmModel,

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
