import type { UnifiedProviderMetadata } from '../types'

import { isStageTamagotchi } from '@proj-airi/stage-shared'
import { createOpenAI } from '@xsai-ext/providers/create'
import { isWebGPUSupported } from 'gpuu/webgpu'

/**
 * Local audio pipeline provider — platform-aware.
 *
 * On desktop (Tamagotchi): uses Candle-based local inference via app sidecar.
 * On browser: uses @xsai-transformers WebGPU-based local inference.
 *
 * Consolidates the old `app-local-audio-speech`, `app-local-audio-transcription`,
 * `browser-local-audio-speech`, and `browser-local-audio-transcription` providers.
 */
export const localPipelineProvider: UnifiedProviderMetadata = {
  id: 'local-pipeline',
  tier: 'enhancement',
  name: 'Local Audio Pipeline',
  nameKey: 'settings.pages.providers.provider.local-pipeline.title',
  description: 'Local speech/transcription (platform-aware)',
  descriptionKey: 'settings.pages.providers.provider.local-pipeline.description',
  icon: 'i-lobe-icons:huggingface',
  order: 40,
  capabilities: {
    chat: false,
    vision: false,
    speech: true,
    transcription: true,
    embedding: false,
    functionCalling: false,
  },
  isAvailableBy: async () => {
    // Available on desktop (Tamagotchi) or browser with WebGPU / enough memory
    if (isStageTamagotchi())
      return true

    const webGPUAvailable = await isWebGPUSupported()
    if (webGPUAvailable)
      return true

    if ('navigator' in globalThis && globalThis.navigator != null && 'deviceMemory' in globalThis.navigator && typeof globalThis.navigator.deviceMemory === 'number') {
      return globalThis.navigator.deviceMemory >= 8
    }
    return false
  },
  defaultOptions: () => ({
    baseUrl: '',
  }),
  createProviders: {
    speech: config => createOpenAI('', (config.baseUrl as string).trim()),
    transcription: config => createOpenAI('', (config.baseUrl as string).trim()),
  },
  operations: {},
  validators: {
    validateProviderConfig: (config) => {
      if (!config.baseUrl) {
        return {
          errors: [new Error('Base URL is required.')],
          reason: 'Base URL is required. This is likely a bug, report to developers on https://github.com/moeru-ai/airi/issues.',
          valid: false,
        }
      }
      return { errors: [], reason: '', valid: true }
    },
  },
}
