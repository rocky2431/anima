import type {
  AnyProviderInstance,
  ModelInfo,
  ProviderCapabilities,
  ProviderRuntimeState,
  ProviderTier,
  UnifiedProviderMetadata,
  VoiceInfo,
} from './providers/types'

import { computedAsync, useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { capabilityToFactoryKey, runCredentialMigration } from './providers-adapter'
import { getUnifiedProvidersByCapability, getUnifiedProvidersByTier, getUnifiedProvidersSorted, unifiedProviders } from './providers/unified'

// Run one-time credential migration from legacy format on module load
runCredentialMigration()

/**
 * Unified provider store for the OpenRouter-First architecture.
 *
 * Manages 12 unified providers (down from ~44 legacy entries).
 * Each provider can serve multiple capabilities (chat, vision, speech, etc.).
 */
export const useUnifiedProvidersStore = defineStore('unified-providers', () => {
  const { t } = useI18n()

  // ═══ Persisted State ════════════════════════════════════════════════
  const providerCredentials = useLocalStorage<Record<string, Record<string, unknown>>>(
    'settings/unified/credentials',
    {},
  )
  const addedProviders = useLocalStorage<Record<string, boolean>>(
    'settings/unified/added',
    {},
  )

  // ═══ Runtime State ══════════════════════════════════════════════════
  const providerRuntimeState = ref<Record<string, ProviderRuntimeState>>({})
  const providerInstanceCache = ref<Record<string, Record<string, AnyProviderInstance>>>({})
  const previousCredentialHashes = ref<Record<string, string>>({})

  // ═══ Metadata Access ════════════════════════════════════════════════

  function getProvider(id: string): UnifiedProviderMetadata | undefined {
    return unifiedProviders[id]
  }

  function getProvidersSorted(): UnifiedProviderMetadata[] {
    return getUnifiedProvidersSorted()
  }

  function getProvidersForCapability(cap: keyof ProviderCapabilities): UnifiedProviderMetadata[] {
    return getUnifiedProvidersByCapability(cap)
  }

  function getProvidersForTier(tier: ProviderTier): UnifiedProviderMetadata[] {
    return getUnifiedProvidersByTier(tier)
  }

  // ═══ Availability ═══════════════════════════════════════════════════

  const availableProvidersMetadata = computedAsync<UnifiedProviderMetadata[]>(async () => {
    const result: UnifiedProviderMetadata[] = []
    for (const provider of getUnifiedProvidersSorted()) {
      const isAvailable = provider.isAvailableBy
        ? await provider.isAvailableBy()
        : true
      if (isAvailable)
        result.push(provider)
    }
    return result
  }, [])

  // ═══ Default Config ═════════════════════════════════════════════════

  function getDefaultConfig(providerId: string): Record<string, unknown> {
    const provider = unifiedProviders[providerId]
    const defaults = provider?.defaultOptions?.() || {}
    return {
      ...defaults,
      ...(Object.prototype.hasOwnProperty.call(defaults, 'baseUrl') ? {} : { baseUrl: '' }),
    }
  }

  // ═══ Initialization ═════════════════════════════════════════════════

  function initializeProvider(providerId: string) {
    if (!providerCredentials.value[providerId]) {
      providerCredentials.value[providerId] = getDefaultConfig(providerId)
    }
    if (!providerRuntimeState.value[providerId]) {
      providerRuntimeState.value[providerId] = {
        isConfigured: false,
        models: [],
        isLoadingModels: false,
        modelLoadError: null,
      }
    }
  }

  // Bootstrap all unified providers
  Object.keys(unifiedProviders).forEach(initializeProvider)

  // ═══ Validation ═════════════════════════════════════════════════════

  async function validateProvider(providerId: string): Promise<boolean> {
    const provider = unifiedProviders[providerId]
    if (!provider)
      return false

    // Web Speech API and similar zero-config providers
    if (!providerCredentials.value[providerId]) {
      providerCredentials.value[providerId] = getDefaultConfig(providerId)
    }

    const config = providerCredentials.value[providerId]
    if (!config)
      return false

    const configString = JSON.stringify(config)
    const runtime = providerRuntimeState.value[providerId]

    // Skip if already validated with identical config
    if (runtime?.validatedCredentialHash === configString && typeof runtime.isConfigured === 'boolean') {
      return runtime.isConfigured
    }

    if (runtime) {
      runtime.validatedCredentialHash = configString
    }

    const result = await provider.validators.validateProviderConfig(config)

    if (runtime) {
      runtime.isConfigured = result.valid
      // Auto-mark zero-config providers as added
      if (result.valid && provider.id === 'web-speech-api') {
        markProviderAdded(providerId)
      }
    }

    return result.valid
  }

  async function updateConfigurationStatus() {
    await Promise.all(
      Object.keys(unifiedProviders).map(async (providerId) => {
        try {
          if (providerRuntimeState.value[providerId]) {
            const isValid = await validateProvider(providerId)
            providerRuntimeState.value[providerId].isConfigured = isValid
          }
        }
        catch {
          if (providerRuntimeState.value[providerId]) {
            providerRuntimeState.value[providerId].isConfigured = false
          }
        }
      }),
    )
  }

  watch(providerCredentials, updateConfigurationStatus, { deep: true, immediate: true })

  // ═══ Computed State ═════════════════════════════════════════════════

  const configuredProviders = computed(() => {
    const result: Record<string, boolean> = {}
    for (const [key, state] of Object.entries(providerRuntimeState.value)) {
      result[key] = state.isConfigured
    }
    return result
  })

  const availableProviders = computed(() =>
    Object.keys(unifiedProviders).filter(id => providerRuntimeState.value[id]?.isConfigured),
  )

  const availableModels = computed(() => {
    const result: Record<string, ModelInfo[]> = {}
    for (const [key, state] of Object.entries(providerRuntimeState.value)) {
      result[key] = state.models
    }
    return result
  })

  const isLoadingModels = computed(() => {
    const result: Record<string, boolean> = {}
    for (const [key, state] of Object.entries(providerRuntimeState.value)) {
      result[key] = state.isLoadingModels
    }
    return result
  })

  const modelLoadError = computed(() => {
    const result: Record<string, string | null> = {}
    for (const [key, state] of Object.entries(providerRuntimeState.value)) {
      result[key] = state.modelLoadError
    }
    return result
  })

  const allAvailableModels = computed(() => {
    const models: ModelInfo[] = []
    for (const providerId of availableProviders.value) {
      models.push(...(providerRuntimeState.value[providerId]?.models || []))
    }
    return models
  })

  // ═══ Instance Management ════════════════════════════════════════════

  async function getProviderInstance(
    providerId: string,
    capability: keyof ProviderCapabilities,
  ): Promise<AnyProviderInstance> {
    const cached = providerInstanceCache.value[providerId]?.[capability]
    if (cached)
      return cached

    const provider = unifiedProviders[providerId]
    if (!provider)
      throw new Error(`Unified provider '${providerId}' not found`)

    if (!provider.capabilities[capability]) {
      throw new Error(`Provider '${providerId}' does not support capability '${capability}'`)
    }

    const factoryKey = capabilityToFactoryKey(capability)
    const factory = provider.createProviders[factoryKey]
    if (!factory) {
      throw new Error(`Provider '${providerId}' has no factory for capability '${factoryKey}'`)
    }

    const config = providerCredentials.value[providerId]
    if (!config)
      throw new Error(`No credentials configured for provider '${providerId}'`)

    const instance = await factory(config)

    if (!providerInstanceCache.value[providerId]) {
      providerInstanceCache.value[providerId] = {}
    }
    (providerInstanceCache.value[providerId] as Record<string, AnyProviderInstance>)[capability] = instance

    return instance
  }

  async function disposeProviderInstance(providerId: string, capability?: keyof ProviderCapabilities) {
    if (capability) {
      const instance = providerInstanceCache.value[providerId]?.[capability] as
        | { dispose?: () => Promise<void> | void }
        | undefined
      if (instance?.dispose)
        await instance.dispose()
      if (providerInstanceCache.value[providerId]) {
        delete (providerInstanceCache.value[providerId] as Record<string, unknown>)[capability]
      }
    }
    else {
      const instances = providerInstanceCache.value[providerId]
      if (instances) {
        for (const inst of Object.values(instances)) {
          const disposable = inst as { dispose?: () => Promise<void> | void }
          if (disposable?.dispose)
            await disposable.dispose()
        }
      }
      delete providerInstanceCache.value[providerId]
    }
  }

  // ═══ Model / Voice Operations ═══════════════════════════════════════

  async function fetchModelsForProvider(
    providerId: string,
    capability?: keyof ProviderCapabilities,
  ): Promise<ModelInfo[]> {
    const config = providerCredentials.value[providerId]
    if (!config)
      return []

    const provider = unifiedProviders[providerId]
    if (!provider?.operations.listModels)
      return []

    const runtime = providerRuntimeState.value[providerId]
    if (runtime) {
      runtime.isLoadingModels = true
      runtime.modelLoadError = null
    }

    try {
      const models = await provider.operations.listModels(config, capability)
      if (runtime) {
        runtime.models = models
        return runtime.models
      }
      return models
    }
    catch (error) {
      console.error(`Error fetching models for ${providerId}:`, error)
      if (runtime) {
        runtime.modelLoadError = error instanceof Error ? error.message : 'Unknown error'
      }
      return []
    }
    finally {
      if (runtime) {
        runtime.isLoadingModels = false
      }
    }
  }

  async function fetchVoicesForProvider(providerId: string): Promise<VoiceInfo[]> {
    const config = providerCredentials.value[providerId]
    if (!config)
      return []

    const provider = unifiedProviders[providerId]
    if (!provider?.operations.listVoices)
      return []

    try {
      return await provider.operations.listVoices(config)
    }
    catch (error) {
      console.error(`Error fetching voices for ${providerId}:`, error)
      return []
    }
  }

  async function loadModelsForConfiguredProviders() {
    for (const providerId of availableProviders.value) {
      const provider = unifiedProviders[providerId]
      if (provider?.operations.listModels) {
        await fetchModelsForProvider(providerId)
      }
    }
  }

  function getModelsForProvider(providerId: string): ModelInfo[] {
    return providerRuntimeState.value[providerId]?.models || []
  }

  function getTranscriptionFeatures(providerId: string) {
    const provider = unifiedProviders[providerId]
    return {
      supportsGenerate: provider?.transcriptionFeatures?.supportsGenerate ?? true,
      supportsStreamOutput: provider?.transcriptionFeatures?.supportsStreamOutput ?? false,
      supportsStreamInput: provider?.transcriptionFeatures?.supportsStreamInput ?? false,
    }
  }

  // ═══ Provider Management ════════════════════════════════════════════

  function markProviderAdded(providerId: string) {
    addedProviders.value[providerId] = true
  }

  function unmarkProviderAdded(providerId: string) {
    delete addedProviders.value[providerId]
  }

  function deleteProvider(providerId: string) {
    delete providerCredentials.value[providerId]
    delete providerRuntimeState.value[providerId]
    unmarkProviderAdded(providerId)
  }

  function forceProviderConfigured(providerId: string) {
    if (providerRuntimeState.value[providerId]) {
      providerRuntimeState.value[providerId].isConfigured = true
      const config = providerCredentials.value[providerId]
      if (config) {
        providerRuntimeState.value[providerId].validatedCredentialHash = JSON.stringify(config)
      }
    }
    markProviderAdded(providerId)
  }

  async function resetProviderSettings() {
    providerCredentials.value = {}
    addedProviders.value = {}
    providerRuntimeState.value = {}
    Object.keys(unifiedProviders).forEach(initializeProvider)
    await updateConfigurationStatus()
  }

  function getProviderConfig(providerId: string) {
    return providerCredentials.value[providerId]
  }

  // ═══ Credential Change Watcher ═════════════════════════════════════

  watch(providerCredentials, (newCreds) => {
    const changed: string[] = []
    for (const id in newCreds) {
      const hash = JSON.stringify(newCreds[id])
      if (hash !== previousCredentialHashes.value[id]) {
        changed.push(id)
        previousCredentialHashes.value[id] = hash
      }
    }
    for (const id of changed) {
      void disposeProviderInstance(id)
      if (providerRuntimeState.value[id]?.isConfigured && unifiedProviders[id]?.operations.listModels) {
        fetchModelsForProvider(id)
      }
    }
  }, { deep: true, immediate: true })

  // ═══ Localized Metadata Helpers ═════════════════════════════════════

  function getLocalizedProvider(provider: UnifiedProviderMetadata) {
    return {
      ...provider,
      localizedName: t(provider.nameKey, provider.name),
      localizedDescription: t(provider.descriptionKey, provider.description),
      configured: providerRuntimeState.value[provider.id]?.isConfigured || false,
    }
  }

  const allProvidersMetadata = computed(() => {
    return getUnifiedProvidersSorted().map(getLocalizedProvider)
  })

  // Tier-based computed (for new settings UI)
  const primaryProviders = computed(() => getProvidersForTier('primary').map(getLocalizedProvider))
  const enhancementProviders = computed(() => getProvidersForTier('enhancement').map(getLocalizedProvider))
  const localProviders = computed(() => getProvidersForTier('local').map(getLocalizedProvider))
  const compatibleProviders = computed(() => getProvidersForTier('compatible').map(getLocalizedProvider))

  // Capability-based computed (for module stores)
  const chatProviders = computed(() => getProvidersForCapability('chat').map(getLocalizedProvider))
  const speechProviders = computed(() => getProvidersForCapability('speech').map(getLocalizedProvider))
  const transcriptionProviders = computed(() => getProvidersForCapability('transcription').map(getLocalizedProvider))
  const embeddingProviders = computed(() => getProvidersForCapability('embedding').map(getLocalizedProvider))
  const visionProviders = computed(() => getProvidersForCapability('vision').map(getLocalizedProvider))

  // ═══ Public API ═════════════════════════════════════════════════════

  return {
    // State
    providers: providerCredentials,
    addedProviders,

    // Metadata
    getProvider,
    getProvidersSorted,
    getProvidersForCapability,
    getProvidersForTier,

    // Configuration
    getProviderConfig,
    getDefaultConfig,
    initializeProvider,
    validateProvider,
    markProviderAdded,
    unmarkProviderAdded,
    deleteProvider,
    forceProviderConfigured,
    resetProviderSettings,

    // Instances
    getProviderInstance,
    disposeProviderInstance,

    // Models / Voices
    fetchModelsForProvider,
    fetchVoicesForProvider,
    loadModelsForConfiguredProviders,
    getModelsForProvider,
    getTranscriptionFeatures,

    // Computed — status
    configuredProviders,
    availableProviders,
    availableProvidersMetadata,
    availableModels,
    isLoadingModels,
    modelLoadError,
    allAvailableModels,
    allProvidersMetadata,

    // Computed — tier
    primaryProviders,
    enhancementProviders,
    localProviders,
    compatibleProviders,

    // Computed — capability
    chatProviders,
    speechProviders,
    transcriptionProviders,
    embeddingProviders,
    visionProviders,
  }
})
