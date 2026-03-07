<script setup lang="ts">
import { Button, Callout, FieldInput } from '@anase/ui'
import { computed, inject, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useUnifiedProvidersStore } from '../../../../stores/unified-providers'
import { RadioCardDetail } from '../../../menu'
import { Alert } from '../../../misc'
import { OnboardingContextKey } from './utils'

const { t } = useI18n()
const context = inject(OnboardingContextKey)!
const unifiedStore = useUnifiedProvidersStore()

const apiKey = ref('')
const baseUrl = ref('')
const accountId = ref('')
const showAdvanced = ref(false)

const validation = ref<'unchecked' | 'pending' | 'succeed' | 'failed'>('unchecked')
const validationError = ref<any>()

// Initialize form with default values when provider changes
function initializeForm() {
  const provider = context.selectedProvider.value
  if (!provider)
    return

  const defaultConfig = unifiedStore.getDefaultConfig(provider.id)
  baseUrl.value = (defaultConfig as any)?.baseUrl || ''
  apiKey.value = ''
  accountId.value = ''

  // Reset validation
  validation.value = 'unchecked'
  validationError.value = undefined
}

// Watch for provider changes
watch(() => context.selectedProvider.value?.id, initializeForm)

watch([apiKey, baseUrl, accountId], () => {
  if (validation.value === 'failed' || validation.value === 'succeed') {
    validation.value = 'unchecked'
    validationError.value = undefined
  }
})

// Computed properties
const needsApiKey = computed(() => {
  if (!context.selectedProvider.value)
    return false
  return context.selectedProvider.value.id !== 'ollama' && context.selectedProvider.value.id !== 'lm-studio'
})

const needsBaseUrl = computed(() => {
  return !!context.selectedProvider.value
})

const canProceed = computed(() => {
  if (!context.selectedProviderId.value)
    return false

  if (needsApiKey.value && !apiKey.value.trim())
    return false

  return validation.value !== 'pending'
})

const primaryActionLabel = computed(() => {
  return validation.value === 'failed'
    ? t('settings.dialogs.onboarding.retry')
    : t('settings.dialogs.onboarding.next')
})

async function validateAndProceed() {
  if (!context.selectedProvider.value)
    return

  validation.value = 'pending'
  validationError.value = undefined

  try {
    // Prepare config object
    const config: Record<string, unknown> = {}

    if (needsApiKey.value)
      config.apiKey = apiKey.value.trim()
    if (needsBaseUrl.value)
      config.baseUrl = baseUrl.value.trim()
    if (accountId.value)
      config.accountId = accountId.value.trim()

    // Temporarily save config so validator can access it
    unifiedStore.providers[context.selectedProvider.value.id] = {
      ...unifiedStore.providers[context.selectedProvider.value.id],
      ...config,
    }

    const isValid = await unifiedStore.validateProvider(context.selectedProvider.value.id)

    if (isValid) {
      validation.value = 'succeed'
      await context.handleNextStep({
        apiKey: apiKey.value,
        baseUrl: baseUrl.value,
        accountId: accountId.value,
      })
    }
    else {
      validation.value = 'failed'
      validationError.value = t('settings.dialogs.onboarding.validationFailed')
    }
  }
  catch (error) {
    validation.value = 'failed'
    validationError.value = t('settings.dialogs.onboarding.validationError', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

async function handleContinueAnyway() {
  if (!context.selectedProvider.value)
    return

  await context.handleNextStep({
    apiKey: apiKey.value,
    baseUrl: baseUrl.value,
    accountId: accountId.value,
  })
  unifiedStore.forceProviderConfigured(context.selectedProvider.value.id)
}

// Placeholder helpers
function getApiKeyPlaceholder(providerId: string): string {
  const placeholders: Record<string, string> = {
    'openrouter': 'sk-or-...',
    'dashscope': 'sk-...',
    'openai-compatible': 'sk-...',
  }
  return placeholders[providerId] || 'API Key'
}

// Initialize on mount
initializeForm()
</script>

<template>
  <div h-full flex flex-col gap-4>
    <div sticky top-0 z-100 flex flex-shrink-0 items-center gap-2>
      <button outline-none @click="context.handlePreviousStep">
        <div class="i-solar:alt-arrow-left-line-duotone h-5 w-5" />
      </button>
      <h2 class="flex-1 text-center text-xl text-neutral-800 font-semibold md:text-left md:text-2xl dark:text-neutral-100">
        {{ t('settings.dialogs.onboarding.selectProvider') }}
      </h2>
      <div class="h-5 w-5" />
    </div>

    <div class="flex-1 overflow-y-auto space-y-4">
      <!-- Provider Selection -->
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <RadioCardDetail
          v-for="provider in context.onboardingProviders.value"
          :id="provider.id"
          :key="provider.id"
          v-model="context.selectedProviderId.value"
          name="provider-selection"
          :value="provider.id"
          :title="provider.localizedName || provider.id"
          :description="provider.localizedDescription || ''"
          :badge="provider.recommended ? 'Recommended' : undefined"
          @click="context.selectProvider(provider)"
        />
      </div>

      <!-- Inline Configuration (shown when provider is selected) -->
      <template v-if="context.selectedProvider.value">
        <Callout label="Keep your API keys safe!" theme="violet">
          <div>
            Anase runs locally in your browser. Your credentials are never sent to our servers.
            <a
              class="inline-flex items-center gap-1 decoration-underline decoration-dashed"
              href="https://github.com/rocky2431/anima"
              target="_blank"
              rel="noopener noreferrer"
            >
              <div i-simple-icons:github inline-block />
              Open source on GitHub
            </a>
          </div>
        </Callout>

        <div class="space-y-4">
          <!-- API Key Input -->
          <div v-if="needsApiKey">
            <FieldInput
              v-model="apiKey"
              :placeholder="getApiKeyPlaceholder(context.selectedProvider.value.id)"
              type="password"
              label="API Key"
              description="Enter your API key for the selected provider."
              required
            />
          </div>

          <!-- Base URL Input (collapsible for non-custom providers) -->
          <div v-if="context.selectedProvider.value.id === 'openai-compatible' || context.selectedProvider.value.id === 'ollama' || context.selectedProvider.value.id === 'lm-studio' || showAdvanced">
            <FieldInput
              v-model="baseUrl"
              :placeholder="(context.selectedProvider.value.defaultOptions?.() as any)?.baseUrl || 'https://api.example.com/v1/'"
              type="text"
              label="Base URL"
              description="API endpoint URL."
            />
          </div>

          <!-- Advanced toggle for providers that have default base URLs -->
          <button
            v-if="needsApiKey && context.selectedProvider.value.id !== 'openai-compatible'"
            class="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
            @click="showAdvanced = !showAdvanced"
          >
            {{ showAdvanced ? 'Hide advanced' : 'Advanced settings' }}
          </button>
        </div>

        <!-- Validation Status -->
        <Alert v-if="validation === 'failed'" type="error">
          <template #title>
            <div class="w-full flex items-center justify-between">
              <span>{{ t('settings.dialogs.onboarding.validationFailed') }}</span>
              <button
                type="button"
                class="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs text-red-600 font-medium transition-colors dark:bg-red-800/30 hover:bg-red-200 dark:text-red-300 dark:hover:bg-red-700/40"
                @click="handleContinueAnyway"
              >
                {{ t('settings.pages.providers.common.continueAnyway') }}
              </button>
            </div>
          </template>
          <template v-if="validationError" #content>
            <pre class="whitespace-pre-wrap break-all">{{ String(validationError) }}</pre>
          </template>
        </Alert>
      </template>
    </div>

    <!-- Action Buttons -->
    <Button
      :label="primaryActionLabel"
      :loading="validation === 'pending'"
      :disabled="!canProceed"
      @click="validateAndProceed"
    />
  </div>
</template>
