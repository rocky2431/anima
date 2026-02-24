import type { ModelInfo, UnifiedProviderMetadata } from '../types'

import { createOpenAI } from '../../../libs/ai/create-provider'

const DASHSCOPE_EMBEDDING_MODELS: ModelInfo[] = [
  { id: 'text-embedding-v4', name: 'Text Embedding v4 (Qwen3, recommended)', provider: 'dashscope', description: '100+ languages, 8192 tokens, variable dimensions', contextLength: 8192 },
  { id: 'text-embedding-v3', name: 'Text Embedding v3', provider: 'dashscope', description: '50+ languages, 8192 tokens, variable dimensions', contextLength: 8192 },
  { id: 'text-embedding-v2', name: 'Text Embedding v2', provider: 'dashscope', description: '10 languages, 2048 tokens, 1536 dimensions', contextLength: 2048 },
]

function normalizeBaseUrl(value: string): string {
  let base = value.trim()
  if (base && !base.endsWith('/'))
    base += '/'
  return base
}

export const dashscopeProvider: UnifiedProviderMetadata = {
  id: 'dashscope',
  tier: 'primary',
  name: 'DashScope',
  nameKey: 'settings.pages.providers.provider.alibaba-cloud-model-studio.title',
  description: 'bailian.console.aliyun.com',
  descriptionKey: 'settings.pages.providers.provider.alibaba-cloud-model-studio.description',
  iconColor: 'i-lobe-icons:alibabacloud',
  order: 2,
  capabilities: {
    chat: true,
    vision: true,
    speech: false,
    transcription: false,
    embedding: true,
    functionCalling: true,
  },
  defaultOptions: () => ({
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/',
  }),
  createProviders: {
    chat: config => createOpenAI(
      (config.apiKey as string).trim(),
      normalizeBaseUrl(config.baseUrl as string),
    ),
    embedding: config => createOpenAI(
      (config.apiKey as string).trim(),
      normalizeBaseUrl(config.baseUrl as string),
    ),
  },
  operations: {
    listModels: async (config, capability) => {
      if (capability === 'embedding') {
        return DASHSCOPE_EMBEDDING_MODELS
      }

      const apiKey = (config.apiKey as string || '').trim()
      const baseUrl = normalizeBaseUrl(config.baseUrl as string || '')
      if (!apiKey || !baseUrl)
        return []

      const { listModels } = await import('../../../libs/ai/list-models')
      const models = await listModels({ apiKey, baseURL: baseUrl })
      return models.map(model => ({
        id: model.id,
        name: (model as any).name || model.id,
        provider: 'dashscope',
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
        const response = await fetch(`${baseUrl}models`, {
          headers: { Authorization: `Bearer ${config.apiKey}` },
        })
        if (!response.ok) {
          const msg = `DashScope validation failed: ${response.status} ${response.statusText}`
          return { errors: [new Error(msg)], reason: msg, valid: false }
        }
      }
      catch (err) {
        const msg = `DashScope validation failed: ${(err as Error).message}`
        return { errors: [err as Error], reason: msg, valid: false }
      }

      return { errors: [], reason: '', valid: true }
    },
  },
}
