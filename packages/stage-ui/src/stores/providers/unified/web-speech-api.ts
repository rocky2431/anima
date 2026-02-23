import type { UnifiedProviderMetadata } from '../types'

import { createWebSpeechAPIProvider } from '../web-speech-api'

export const webSpeechApiProvider: UnifiedProviderMetadata = {
  id: 'web-speech-api',
  tier: 'enhancement',
  name: 'Web Speech API',
  nameKey: 'settings.pages.providers.provider.browser-web-speech-api.title',
  description: 'Browser-native speech recognition (free)',
  descriptionKey: 'settings.pages.providers.provider.browser-web-speech-api.description',
  icon: 'i-solar:microphone-3-bold-duotone',
  order: 30,
  capabilities: {
    chat: false,
    vision: false,
    speech: false,
    transcription: true,
    embedding: false,
    functionCalling: false,
  },
  isAvailableBy: () => {
    return typeof window !== 'undefined'
      && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)
  },
  defaultOptions: () => ({
    language: 'en-US',
    continuous: true,
    interimResults: true,
    maxAlternatives: 1,
  }),
  createProviders: {
    transcription: async () => {
      return createWebSpeechAPIProvider()
    },
  },
  operations: {
    listModels: async () => [{
      id: 'web-speech-api',
      name: 'Web Speech API (Browser)',
      provider: 'web-speech-api',
      description: 'Browser-native speech recognition',
    }],
  },
  validators: {
    validateProviderConfig: () => {
      const isAvailable = typeof window !== 'undefined'
        && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)

      if (!isAvailable) {
        return {
          errors: [new Error('Web Speech API is not available in this browser')],
          reason: 'Web Speech API is not available in this browser. Try Chrome or Edge.',
          valid: false,
        }
      }

      return { errors: [], reason: '', valid: true }
    },
  },
  transcriptionFeatures: {
    supportsGenerate: false,
    supportsStreamOutput: true,
    supportsStreamInput: true,
  },
}
