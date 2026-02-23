import type { ModelInfo, UnifiedProviderMetadata, ValidationResult } from '../types'

import { isUrl } from '@proj-airi/stage-shared'
import { createOpenAI } from '@xsai-ext/providers/create'

export const lmStudioProvider: UnifiedProviderMetadata = {
  id: 'lm-studio',
  tier: 'local',
  name: 'LM Studio',
  nameKey: 'settings.pages.providers.provider.lm-studio.title',
  description: 'lmstudio.ai',
  descriptionKey: 'settings.pages.providers.provider.lm-studio.description',
  icon: 'i-lobe-icons:lmstudio',
  order: 51,
  capabilities: {
    chat: true,
    vision: false,
    speech: false,
    transcription: false,
    embedding: false,
    functionCalling: false,
  },
  defaultOptions: () => ({
    baseUrl: 'http://localhost:1234/v1/',
  }),
  createProviders: {
    chat: config => createOpenAI('', (config.baseUrl as string).trim()),
  },
  operations: {
    listModels: async (config) => {
      const baseUrl = (config.baseUrl as string || '').trim()
      if (!baseUrl)
        return []

      try {
        const response = await fetch(`${baseUrl}models`, {
          headers: (config.headers as HeadersInit) || undefined,
        })
        if (!response.ok)
          return []

        const data = await response.json()
        return data.data.map((model: any): ModelInfo => ({
          id: model.id,
          name: model.id,
          provider: 'lm-studio',
          description: model.description || '',
          contextLength: model.context_length || 0,
          deprecated: false,
        }))
      }
      catch (error) {
        console.error('Error fetching LM Studio models:', error)
        return []
      }
    },
  },
  validators: {
    validateProviderConfig: async (config): Promise<ValidationResult> => {
      if (!config.baseUrl) {
        return {
          errors: [new Error('Base URL is required.')],
          reason: 'Base URL is required. Default to http://localhost:1234/v1/ for LM Studio.',
          valid: false,
        }
      }

      const baseUrl = config.baseUrl as string
      if (!isUrl(baseUrl) || new URL(baseUrl).host.length === 0) {
        return {
          errors: [new Error('Base URL is not absolute.')],
          reason: 'Base URL is not absolute. Try to include a scheme (http:// or https://).',
          valid: false,
        }
      }
      if (!baseUrl.endsWith('/')) {
        return {
          errors: [new Error('Base URL must end with a trailing slash (/).')],
          reason: 'Base URL must end with a trailing slash (/).',
          valid: false,
        }
      }

      try {
        const response = await fetch(`${baseUrl.trim()}models`, {
          headers: (config.headers as HeadersInit) || undefined,
        })
        if (!response.ok) {
          const msg = `LM Studio server returned non-ok status code: ${response.statusText}`
          return { errors: [new Error(msg)], reason: msg, valid: false }
        }
        return { errors: [], reason: '', valid: true }
      }
      catch (err) {
        return {
          errors: [err as Error],
          reason: `Failed to reach LM Studio server, error: ${String(err)} occurred.\n\nMake sure LM Studio is running and the local server is started. You can start the local server in LM Studio by going to the 'Local Server' tab and clicking 'Start Server'.`,
          valid: false,
        }
      }
    },
  },
}
