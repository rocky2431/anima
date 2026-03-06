import type { UnifiedProviderMetadata } from '../types'

import { isUrl } from '@anase/stage-shared'

import { createOpenRouter } from '../../../libs/ai/create-provider'
import { listModels } from '../../../libs/ai/list-models'

function normalizeBaseUrl(value: string): string {
  let base = value.trim()
  if (base && !base.endsWith('/'))
    base += '/'
  return base
}

export const openrouterProvider: UnifiedProviderMetadata = {
  id: 'openrouter',
  tier: 'primary',
  name: 'OpenRouter',
  nameKey: 'settings.pages.providers.provider.openrouter.title',
  description: 'openrouter.ai',
  descriptionKey: 'settings.pages.providers.provider.openrouter.description',
  icon: 'i-lobe-icons:openrouter',
  order: 1,
  recommended: true,
  capabilities: {
    chat: true,
    vision: true,
    speech: true,
    transcription: true,
    embedding: true,
    functionCalling: true,
  },
  defaultOptions: () => ({
    baseUrl: 'https://openrouter.ai/api/v1/',
  }),
  createProviders: {
    chat: config => createOpenRouter(
      (config.apiKey as string).trim(),
      normalizeBaseUrl(config.baseUrl as string),
    ),
    speech: config => createOpenRouter(
      (config.apiKey as string).trim(),
      normalizeBaseUrl(config.baseUrl as string),
    ),
    transcription: config => createOpenRouter(
      (config.apiKey as string).trim(),
      normalizeBaseUrl(config.baseUrl as string),
    ),
    embedding: config => createOpenRouter(
      (config.apiKey as string).trim(),
      normalizeBaseUrl(config.baseUrl as string),
    ),
  },
  operations: {
    listModels: async (config, capability) => {
      const apiKey = (config.apiKey as string || '').trim()
      const baseUrl = normalizeBaseUrl(config.baseUrl as string || '')
      if (!apiKey || !baseUrl)
        return []

      // Embedding model listing is handled via backend proxy (CORS bypass)
      // See embedding store's loadModelsForProvider → embedding:models:list event
      if (capability === 'embedding')
        return []

      const models = await listModels({ apiKey, baseURL: baseUrl })
      return models.map(model => ({
        id: model.id,
        name: (model as any).name || (model as any).display_name || model.id,
        provider: 'openrouter',
        description: (model as any).description || '',
        contextLength: (model as any).context_length || 0,
        deprecated: false,
      }))
    },
  },
  validators: {
    validateProviderConfig: async (config) => {
      const errors: Error[] = []

      if (!config.apiKey)
        errors.push(new Error('API Key is required'))
      if (!config.baseUrl)
        errors.push(new Error('Base URL is required'))

      if (errors.length > 0)
        return { errors, reason: errors.map(e => e.message).join(', '), valid: false }

      const baseUrl = config.baseUrl as string
      if (!isUrl(baseUrl) || new URL(baseUrl).host.length === 0)
        errors.push(new Error('Base URL is not absolute. Check your input.'))
      if (!baseUrl.endsWith('/'))
        errors.push(new Error('Base URL must end with a trailing slash (/).'))

      if (errors.length > 0)
        return { errors, reason: errors.map(e => e.message).join(', '), valid: false }

      try {
        const response = await fetch(`${baseUrl}chat/completions`, {
          headers: { Authorization: `Bearer ${config.apiKey}` },
          method: 'POST',
          body: '{"model": "test","messages": [{"role": "user","content": "Hello, world"}],"stream": false}',
        })
        const responseJson = await response.json()

        if (!responseJson.user_id) {
          const msg = `OpenRouterError: ${responseJson.error?.message ?? 'Unknown error'}`
          return { errors: [new Error(msg)], reason: msg, valid: false }
        }
      }
      catch (err) {
        const msg = `OpenRouter validation failed: ${(err as Error).message}`
        return { errors: [err as Error], reason: msg, valid: false }
      }

      return { errors: [], reason: '', valid: true }
    },
  },
}
