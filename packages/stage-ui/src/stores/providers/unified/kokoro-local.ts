import type { ModelInfo, ProgressInfo, SpeechProvider, UnifiedProviderMetadata, VoiceInfo } from '../types'

import { isStageTamagotchi } from '@anase/stage-shared'
import { isWebGPUSupported } from 'gpuu/webgpu'

import { getKokoroWorker } from '../../../workers/kokoro'
import { getDefaultKokoroModel, KOKORO_MODELS, kokoroModelsToModelInfo } from '../../../workers/kokoro/constants'

export const kokoroLocalProvider: UnifiedProviderMetadata = {
  id: 'kokoro-local',
  tier: 'enhancement',
  name: 'Kokoro TTS',
  nameKey: 'settings.pages.providers.provider.kokoro-local.title',
  description: 'Local text-to-speech using Kokoro-82M.',
  descriptionKey: 'settings.pages.providers.provider.kokoro-local.description',
  icon: 'i-lobe-icons:speaker',
  order: 25,
  capabilities: {
    chat: false,
    vision: false,
    speech: true,
    transcription: false,
    embedding: false,
    functionCalling: false,
  },
  isAvailableBy: async () => {
    if (isStageTamagotchi())
      return false
    const webGPUAvailable = await isWebGPUSupported()
    if (webGPUAvailable)
      return true
    if ('navigator' in globalThis && globalThis.navigator != null && 'deviceMemory' in globalThis.navigator && typeof globalThis.navigator.deviceMemory === 'number') {
      return globalThis.navigator.deviceMemory >= 8
    }
    return false
  },
  defaultOptions: () => {
    const hasWebGPU = typeof navigator !== 'undefined' && !!navigator.gpu
    return {
      model: getDefaultKokoroModel(hasWebGPU),
      voiceId: '',
    }
  },
  createProviders: {
    speech: async () => {
      const workerManagerPromise = getKokoroWorker()
      const provider: SpeechProvider = {
        speech: () => ({
          baseURL: 'http://kokoro-local/v1/',
          model: 'kokoro-82m',
          fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
            if (!init?.body || typeof init.body !== 'string')
              throw new Error('Invalid request body')
            const body = JSON.parse(init.body)
            if (!body.voice)
              throw new Error('Voice parameter is required')
            const buffer = await (await workerManagerPromise).generate(body.input, body.voice)
            return new Response(buffer, {
              status: 200,
              headers: { 'Content-Type': 'audio/wav' },
            })
          },
        }),
      }
      return provider
    },
  },
  operations: {
    listModels: async (_config, _capability?): Promise<ModelInfo[]> => {
      const hasWebGPU = typeof navigator !== 'undefined' && !!navigator.gpu
      // Note: kokoroModelsToModelInfo requires `t` from i18n, but we return raw here.
      // The caller (store) should handle localization.
      return kokoroModelsToModelInfo(hasWebGPU)
    },
    loadModel: async (config, hooks?: { onProgress?: (progress: ProgressInfo) => Promise<void> | void }) => {
      const modelId = config.model as string
      if (!modelId)
        throw new Error('No model specified')

      const modelDef = KOKORO_MODELS.find(m => m.id === modelId)
      if (!modelDef)
        throw new Error(`Invalid model: ${modelId}. Must be one of: ${KOKORO_MODELS.map(m => m.id).join(', ')}`)

      if (modelDef.platform === 'webgpu') {
        const hasWebGPU = typeof navigator !== 'undefined' && !!navigator.gpu
        if (!hasWebGPU)
          throw new Error('WebGPU is required for this model but is not available in your browser')
      }

      const workerManager = await getKokoroWorker()
      await workerManager.loadModel(modelDef.quantization, modelDef.platform, { onProgress: hooks?.onProgress })
    },
    listVoices: async (config): Promise<VoiceInfo[]> => {
      try {
        const modelId = config.model as string
        if (modelId) {
          const modelDef = KOKORO_MODELS.find(m => m.id === modelId)
          if (modelDef) {
            if (modelDef.platform === 'webgpu') {
              const hasWebGPU = typeof navigator !== 'undefined' && !!navigator.gpu
              if (!hasWebGPU)
                throw new Error('WebGPU is required for this model but is not available in your browser')
            }
            const workerManager = await getKokoroWorker()
            await workerManager.loadModel(modelDef.quantization, modelDef.platform)
          }
        }

        const workerManager = await getKokoroWorker()
        const modelVoices = workerManager.getVoices()

        const languageMap: Record<string, { code: string, title: string }> = {
          'en-us': { code: 'en-US', title: 'English (US)' },
          'en-gb': { code: 'en-GB', title: 'English (UK)' },
          'ja': { code: 'ja', title: 'Japanese' },
          'zh-cn': { code: 'zh-CN', title: 'Chinese (Mandarin)' },
          'es': { code: 'es', title: 'Spanish' },
          'fr': { code: 'fr', title: 'French' },
          'hi': { code: 'hi', title: 'Hindi' },
          'it': { code: 'it', title: 'Italian' },
          'pt-br': { code: 'pt-BR', title: 'Portuguese (Brazil)' },
        }

        return Object.entries(modelVoices).map(([id, voice]: [string, { language: string, name: string, gender: string }]) => {
          const languageCode = voice.language.toLowerCase()
          const languageInfo = languageMap[languageCode] || { code: languageCode, title: voice.language }
          return {
            id,
            name: `${voice.name} (${voice.gender}, ${languageInfo.title.split('(')[0].trim()})`,
            provider: 'kokoro-local',
            languages: [languageInfo],
            gender: voice.gender.toLowerCase(),
          }
        })
      }
      catch {
        return []
      }
    },
  },
  validators: {
    validateProviderConfig: async (config) => {
      const model = config.model as string
      if (!model) {
        return {
          errors: [new Error('No model selected')],
          reason: 'Please select a model from the dropdown menu',
          valid: false,
        }
      }
      if (!KOKORO_MODELS.some(m => m.id === model)) {
        return {
          errors: [new Error(`Invalid model: ${model}`)],
          reason: `Invalid model. Must be one of: ${KOKORO_MODELS.map(m => m.id).join(', ')}`,
          valid: false,
        }
      }
      return { errors: [], reason: '', valid: true }
    },
  },
}
