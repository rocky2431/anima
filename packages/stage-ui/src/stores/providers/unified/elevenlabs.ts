import type { UnElevenLabsOptions, VoiceProviderWithExtraOptions } from 'unspeech'

import type { ModelInfo, SpeechProviderWithExtraOptions, UnifiedProviderMetadata, ValidationResult, VoiceInfo } from '../types'

import { isUrl } from '@proj-airi/stage-shared'
import { createUnElevenLabs, listVoices } from 'unspeech'

import { models as elevenLabsModels } from '../elevenlabs/list-models'

export const elevenlabsProvider: UnifiedProviderMetadata = {
  id: 'elevenlabs',
  tier: 'enhancement',
  name: 'ElevenLabs',
  nameKey: 'settings.pages.providers.provider.elevenlabs.title',
  description: 'elevenlabs.io',
  descriptionKey: 'settings.pages.providers.provider.elevenlabs.description',
  icon: 'i-simple-icons:elevenlabs',
  order: 20,
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
    voiceSettings: {
      similarityBoost: 0.75,
      stability: 0.5,
    },
  }),
  createProviders: {
    speech: config => createUnElevenLabs(
      (config.apiKey as string).trim(),
      (config.baseUrl as string).trim(),
    ) as SpeechProviderWithExtraOptions<string, UnElevenLabsOptions>,
  },
  operations: {
    listModels: async (): Promise<ModelInfo[]> => {
      return elevenLabsModels.map(model => ({
        id: model.model_id,
        name: model.name,
        provider: 'elevenlabs',
        description: model.description,
        contextLength: 0,
        deprecated: false,
      }))
    },
    listVoices: async (config): Promise<VoiceInfo[]> => {
      const provider = createUnElevenLabs(
        (config.apiKey as string).trim(),
        (config.baseUrl as string).trim(),
      ) as VoiceProviderWithExtraOptions<UnElevenLabsOptions>

      const voices = await listVoices({ ...provider.voice() })

      // Rearrange: move Aria–Bill range to end (default voices)
      const ariaIndex = voices.findIndex(v => v.name.includes('Aria'))
      const billIndex = voices.findIndex(v => v.name.includes('Bill'))
      const lo = Math.min(
        ariaIndex !== -1 ? ariaIndex : 0,
        billIndex !== -1 ? billIndex : voices.length - 1,
      )
      const hi = Math.max(
        ariaIndex !== -1 ? ariaIndex : 0,
        billIndex !== -1 ? billIndex : voices.length - 1,
      )

      const rearranged = [
        ...voices.slice(0, lo),
        ...voices.slice(hi + 1),
        ...voices.slice(lo, hi + 1),
      ]

      return rearranged.map(voice => ({
        id: voice.id,
        name: voice.name,
        provider: 'elevenlabs',
        previewURL: voice.preview_audio_url,
        languages: voice.languages,
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
