import type { UnVolcengineOptions, VoiceProviderWithExtraOptions } from 'unspeech'

import type { ModelInfo, UnifiedProviderMetadata, ValidationResult, VoiceInfo } from '../types'

import { isUrl } from '@proj-airi/stage-shared'
import { createUnVolcengine, listVoices } from 'unspeech'

export const volcengineProvider: UnifiedProviderMetadata = {
  id: 'volcengine',
  tier: 'enhancement',
  name: 'Volcengine',
  nameKey: 'settings.pages.providers.provider.volcengine.title',
  description: 'volcengine.com',
  descriptionKey: 'settings.pages.providers.provider.volcengine.description',
  iconColor: 'i-lobe-icons:volcengine',
  order: 26,
  capabilities: {
    chat: false,
    vision: false,
    speech: true,
    transcription: false,
    embedding: false,
    functionCalling: false,
  },
  defaultOptions: () => ({
    baseUrl: 'https://unspeech.hyp3r.link/v1/',
  }),
  createProviders: {
    speech: config => createUnVolcengine(
      (config.apiKey as string).trim(),
      (config.baseUrl as string).trim(),
    ),
  },
  operations: {
    listModels: async (): Promise<ModelInfo[]> => [{
      id: 'v1',
      name: 'v1',
      provider: 'volcengine',
      description: '',
      contextLength: 0,
      deprecated: false,
    }],
    listVoices: async (config): Promise<VoiceInfo[]> => {
      const provider = createUnVolcengine(
        (config.apiKey as string).trim(),
        (config.baseUrl as string).trim(),
      ) as VoiceProviderWithExtraOptions<UnVolcengineOptions>

      const voices = await listVoices({ ...provider.voice() })
      return voices.map(voice => ({
        id: voice.id,
        name: voice.name,
        provider: 'volcengine',
        previewURL: voice.preview_audio_url,
        languages: voice.languages,
        gender: voice.labels?.gender,
      }))
    },
  },
  validators: {
    validateProviderConfig: (config): ValidationResult => {
      const errors: Error[] = []
      if (!config.apiKey)
        errors.push(new Error('API key is required.'))
      if (!config.baseUrl)
        errors.push(new Error('Base URL is required.'))
      if (!(config.app as any)?.appId)
        errors.push(new Error('App ID is required.'))

      if (config.baseUrl) {
        const baseUrl = config.baseUrl as string
        if (!isUrl(baseUrl) || new URL(baseUrl).host.length === 0)
          errors.push(new Error('Base URL is not absolute.'))
        else if (!baseUrl.endsWith('/'))
          errors.push(new Error('Base URL must end with a trailing slash (/).'))
      }

      return {
        errors,
        reason: errors.map(e => e.message).join(', '),
        valid: errors.length === 0,
      }
    },
  },
}
