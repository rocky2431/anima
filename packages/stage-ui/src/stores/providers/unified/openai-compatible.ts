import type { UnifiedProviderMetadata } from '../types'

import { createOpenAI } from '../../../libs/ai/create-provider'
import { listModels } from '../../../libs/ai/list-models'

export const openaiCompatibleProvider: UnifiedProviderMetadata = {
  id: 'openai-compatible',
  tier: 'compatible',
  name: 'OpenAI Compatible',
  nameKey: 'settings.pages.providers.provider.openai-compatible.title',
  description: 'Connect to any API that follows the OpenAI specification.',
  descriptionKey: 'settings.pages.providers.provider.openai-compatible.description',
  icon: 'i-lobe-icons:openai',
  order: 100,
  capabilities: {
    chat: true,
    vision: false,
    speech: true,
    transcription: true,
    embedding: false,
    functionCalling: false,
  },
  defaultOptions: () => ({
    baseUrl: '',
  }),
  createProviders: {
    chat: config => createOpenAI(
      (config.apiKey as string).trim(),
      normalizeBaseUrl(config.baseUrl as string),
    ),
    speech: config => createOpenAI(
      (config.apiKey as string).trim(),
      normalizeBaseUrl(config.baseUrl as string),
    ),
    transcription: config => createOpenAI(
      (config.apiKey as string).trim(),
      normalizeBaseUrl(config.baseUrl as string),
    ),
  },
  operations: {
    listModels: async (config) => {
      const apiKey = (config.apiKey as string || '').trim()
      const baseUrl = normalizeBaseUrl(config.baseUrl as string || '')
      if (!apiKey || !baseUrl)
        return []

      const models = await listModels({ apiKey, baseURL: baseUrl })
      return models.map(model => ({
        id: model.id,
        name: (model as any).name || (model as any).display_name || model.id,
        provider: 'openai-compatible',
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

      try {
        const baseUrl = normalizeBaseUrl(config.baseUrl as string)
        if (new URL(baseUrl).host.length === 0)
          errors.push(new Error('Base URL is not absolute. Check your input.'))
      }
      catch {
        errors.push(new Error('Base URL is invalid. It must be an absolute URL.'))
      }

      return {
        errors,
        reason: errors.map(e => e.message).join(', '),
        valid: errors.length === 0,
      }
    },
  },
}

function normalizeBaseUrl(value: string): string {
  let base = value.trim()
  if (base && !base.endsWith('/'))
    base += '/'
  return base
}
