import type { UnDeepgramOptions, VoiceProviderWithExtraOptions } from 'unspeech'

import type { SpeechProviderWithExtraOptions, UnifiedProviderMetadata, ValidationResult, VoiceInfo } from '../types'

import { isUrl } from '@anase/stage-shared'
import { createUnDeepgram, listVoices } from 'unspeech'

export const deepgramProvider: UnifiedProviderMetadata = {
  id: 'deepgram',
  tier: 'enhancement',
  name: 'Deepgram',
  nameKey: 'settings.pages.providers.provider.deepgram-tts.title',
  description: 'deepgram.com',
  descriptionKey: 'settings.pages.providers.provider.deepgram-tts.description',
  icon: 'i-simple-icons:deepgram',
  order: 23,
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
    speech: config => createUnDeepgram(
      (config.apiKey as string).trim(),
      (config.baseUrl as string).trim(),
    ) as SpeechProviderWithExtraOptions<string, UnDeepgramOptions>,
  },
  operations: {
    listVoices: async (config): Promise<VoiceInfo[]> => {
      const provider = createUnDeepgram(
        (config.apiKey as string).trim(),
        (config.baseUrl as string).trim(),
      ) as VoiceProviderWithExtraOptions<UnDeepgramOptions>

      const voices = await listVoices({ ...provider.voice() })
      return voices.map(voice => ({
        id: voice.id,
        name: voice.name,
        provider: 'deepgram',
        description: voice.description,
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
