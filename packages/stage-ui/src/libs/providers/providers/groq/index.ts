import { z } from 'zod'

import { createGroq } from '../../../../libs/ai/create-provider'
import { createOpenAICompatibleValidators } from '../../validators/openai-compatible'
import { defineProvider } from '../registry'

const groqConfigSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default('https://api.groq.com/openai/v1/'),
})

type GroqConfig = z.input<typeof groqConfigSchema>

export const providerGroq = defineProvider<GroqConfig>({
  id: 'groq',
  name: 'Groq',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.groq.title'),
  description: 'groq.com',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.groq.description'),
  tasks: ['chat'],
  icon: 'i-lobe-icons:groq',

  createProviderConfig: ({ t }) => groqConfigSchema.extend({
    apiKey: groqConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: groqConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  createProvider(config) {
    return createGroq(config.apiKey, config.baseUrl)
  },

  validationRequiredWhen(config) {
    return !!config.apiKey?.trim()
  },
  validators: {
    ...createOpenAICompatibleValidators({
      checks: ['model_list'],
    }),
  },
})
