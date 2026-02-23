import type { UnifiedProviderMetadata } from '../types'

import { createAliyunNLSProvider as createAliyunNlsStreamProvider } from '../aliyun/stream-transcription'

export const ALIYUN_NLS_REGIONS = [
  'cn-shanghai',
  'cn-shanghai-internal',
  'cn-beijing',
  'cn-beijing-internal',
  'cn-shenzhen',
  'cn-shenzhen-internal',
] as const

export type AliyunNlsRegion = typeof ALIYUN_NLS_REGIONS[number]

export const aliyunProvider: UnifiedProviderMetadata = {
  id: 'aliyun',
  tier: 'enhancement',
  name: 'Aliyun NLS',
  nameKey: 'settings.pages.providers.provider.aliyun-nls.title',
  description: 'nls-portal.console.aliyun.com',
  descriptionKey: 'settings.pages.providers.provider.aliyun-nls.description',
  iconColor: 'i-lobe-icons:alibabacloud',
  order: 24,
  capabilities: {
    chat: false,
    vision: false,
    speech: false,
    transcription: true,
    embedding: false,
    functionCalling: false,
  },
  defaultOptions: () => ({
    region: 'cn-shanghai' as AliyunNlsRegion,
  }),
  createProviders: {
    transcription: async (config) => {
      return createAliyunNlsStreamProvider(
        config.accessKeyId as string,
        config.accessKeySecret as string,
        config.appKey as string,
        { region: (config.region as AliyunNlsRegion) || 'cn-shanghai' },
      )
    },
  },
  operations: {},
  validators: {
    validateProviderConfig: (config) => {
      const errors: Error[] = []
      if (!config.accessKeyId)
        errors.push(new Error('Access Key ID is required.'))
      if (!config.accessKeySecret)
        errors.push(new Error('Access Key Secret is required.'))
      if (!config.appKey)
        errors.push(new Error('App Key is required.'))

      return {
        errors,
        reason: errors.map(e => e.message).join(', '),
        valid: errors.length === 0,
      }
    },
  },
  transcriptionFeatures: {
    supportsGenerate: false,
    supportsStreamOutput: true,
    supportsStreamInput: true,
  },
}
