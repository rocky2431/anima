import type { ModelInfo, UnifiedProviderMetadata, ValidationResult } from '../types'

import { isUrl } from '@proj-airi/stage-shared'
import { createOllama } from '@xsai-ext/providers/create'
import { listModels } from '@xsai/model'

export const ollamaProvider: UnifiedProviderMetadata = {
  id: 'ollama',
  tier: 'local',
  name: 'Ollama',
  nameKey: 'settings.pages.providers.provider.ollama.title',
  description: 'ollama.com',
  descriptionKey: 'settings.pages.providers.provider.ollama.description',
  icon: 'i-lobe-icons:ollama',
  order: 50,
  capabilities: {
    chat: true,
    vision: true,
    embedding: true,
    speech: false,
    transcription: false,
    functionCalling: true,
  },
  defaultOptions: () => ({
    baseUrl: 'http://localhost:11434/v1/',
  }),
  createProviders: {
    chat: config => createOllama('', (config.baseUrl as string).trim()),
    embedding: config => createOllama((config.baseUrl as string).trim()),
  },
  operations: {
    listModels: async (config, capability?) => {
      const baseUrl = (config.baseUrl as string || '').trim()
      if (!baseUrl)
        return []

      // Use apiKey='' for chat, but for embedding the first arg is baseUrl
      const providerForList = capability === 'embedding'
        ? createOllama(baseUrl)
        : createOllama('', baseUrl)

      const models = await listModels({ ...providerForList.model() })
      return models.map((model): ModelInfo => ({
        id: model.id,
        name: model.id,
        provider: 'ollama',
        description: '',
        contextLength: 0,
        deprecated: false,
      }))
    },
  },
  validators: {
    validateProviderConfig: async (config): Promise<ValidationResult> => {
      if (!config.baseUrl) {
        return {
          errors: [new Error('Base URL is required.')],
          reason: 'Base URL is required. Default to http://localhost:11434/v1/ for Ollama.',
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
          const msg = `Ollama server returned non-ok status code: ${response.statusText}`
          return { errors: [new Error(msg)], reason: msg, valid: false }
        }
        return { errors: [], reason: '', valid: true }
      }
      catch (err) {
        return {
          errors: [err as Error],
          reason: `Failed to reach Ollama server, error: ${String(err)} occurred.\n\nIf you are using Ollama locally, this is likely the CORS (Cross-Origin Resource Sharing) security issue, where you will need to set OLLAMA_ORIGINS=* environment variable before launching Ollama server to make this work.`,
          valid: false,
        }
      }
    },
  },
}
