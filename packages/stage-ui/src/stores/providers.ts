/**
 * Backward-compatible providers store.
 *
 * Thin adapter wrapping `useUnifiedProvidersStore`.
 * Consumers should gradually migrate to importing from `unified-providers.ts` directly.
 *
 * Phase 7 cleanup: reduced from ~2906 lines to ~300 lines.
 */

import type {
  ChatProvider,
  ChatProviderWithExtraOptions,
  EmbedProvider,
  EmbedProviderWithExtraOptions,
  SpeechProvider,
  SpeechProviderWithExtraOptions,
  TranscriptionProvider,
  TranscriptionProviderWithExtraOptions,
} from '@xsai-ext/providers/utils'
import type { ProgressInfo } from '@xsai-transformers/shared/types'

import type {
  AnyProviderInstance,
  ProviderCapabilities,
  UnifiedProviderMetadata,
} from './providers/types'

import { computedAsync } from '@vueuse/core'
import { defineStore, storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { capabilityToFactoryKey, LEGACY_ID_MAP } from './providers-adapter'
import { getUnifiedProvidersSorted, unifiedProviders } from './providers/unified'
import { useUnifiedProvidersStore } from './unified-providers'

// ═══ Re-exported Types (backward compat) ════════════════════════════

export type { ModelInfo, ProviderRuntimeState, VoiceInfo } from './providers/types'

/**
 * Legacy provider metadata shape.
 * Kept for existing consumers that depend on `category` and `createProvider`.
 */
export interface ProviderMetadata {
  id: string
  order?: number
  category: 'chat' | 'embed' | 'speech' | 'transcription'
  tasks: string[]
  nameKey: string
  name: string
  localizedName?: string
  descriptionKey: string
  description: string
  localizedDescription?: string
  configured?: boolean
  isAvailableBy?: () => Promise<boolean> | boolean
  icon?: string
  iconColor?: string
  iconImage?: string
  defaultOptions?: () => Record<string, unknown>
  createProvider: (
    config: Record<string, unknown>,
  ) =>
    | AnyProviderInstance
    | Promise<AnyProviderInstance>
  capabilities: {
    listModels?: (config: Record<string, unknown>) => Promise<{ id: string, name: string, provider: string, description?: string, capabilities?: string[], contextLength?: number, deprecated?: boolean }[]>
    listVoices?: (config: Record<string, unknown>) => Promise<{ id: string, name: string, provider: string, languages: { code: string, title: string }[] }[]>
    loadModel?: (config: Record<string, unknown>, hooks?: { onProgress?: (progress: ProgressInfo) => Promise<void> | void }) => Promise<void>
  }
  validators: {
    validateProviderConfig: (config: Record<string, unknown>) => Promise<{
      errors: unknown[]
      reason: string
      valid: boolean
    }> | {
      errors: unknown[]
      reason: string
      valid: boolean
    }
  }
  transcriptionFeatures?: {
    supportsGenerate: boolean
    supportsStreamOutput: boolean
    supportsStreamInput: boolean
  }
}

// ═══ ID Resolution ══════════════════════════════════════════════════

/**
 * Resolve a potentially-legacy provider ID to its unified equivalent.
 * If the ID is already a unified ID, returns it unchanged.
 */
export function resolveProviderId(id: string): string {
  return LEGACY_ID_MAP[id]?.unifiedId ?? id
}

// ═══ Legacy Metadata Builder ════════════════════════════════════════

function getPrimaryCategory(unified: UnifiedProviderMetadata): ProviderMetadata['category'] {
  if (unified.capabilities.chat)
    return 'chat'
  if (unified.capabilities.speech)
    return 'speech'
  if (unified.capabilities.transcription)
    return 'transcription'
  if (unified.capabilities.embedding)
    return 'embed'
  return 'chat'
}

function buildLegacyMetadata(unified: UnifiedProviderMetadata): ProviderMetadata {
  const category = getPrimaryCategory(unified)
  const factoryKey = capabilityToFactoryKey(category === 'embed' ? 'embedding' : category)

  return {
    id: unified.id,
    order: unified.order,
    category,
    tasks: Object.entries(unified.capabilities)
      .filter(([, v]) => v)
      .map(([k]) => k),
    nameKey: unified.nameKey,
    name: unified.name,
    descriptionKey: unified.descriptionKey,
    description: unified.description,
    icon: unified.icon,
    iconColor: unified.iconColor,
    iconImage: unified.iconImage,
    isAvailableBy: unified.isAvailableBy,
    defaultOptions: unified.defaultOptions,
    createProvider: (config) => {
      const factory = unified.createProviders[factoryKey]
      if (!factory) {
        throw new Error(`No ${factoryKey} factory for provider '${unified.id}'`)
      }
      return factory(config)
    },
    capabilities: {
      listModels: unified.operations.listModels
        ? config => unified.operations.listModels!(config)
        : undefined,
      listVoices: unified.operations.listVoices,
      loadModel: unified.operations.loadModel,
    },
    validators: unified.validators,
    transcriptionFeatures: unified.transcriptionFeatures,
  }
}

// ═══ Static Metadata (12 unified entries) ═══════════════════════════

const _metadataMap: Record<string, ProviderMetadata> = {}
for (const unified of getUnifiedProvidersSorted()) {
  _metadataMap[unified.id] = buildLegacyMetadata(unified)
}

/** Proxy that resolves legacy IDs transparently. */
const staticProviderMetadata: Record<string, ProviderMetadata> = new Proxy(_metadataMap, {
  get(target, prop) {
    if (typeof prop !== 'string')
      return Reflect.get(target, prop)
    return target[resolveProviderId(prop)]
  },
  has(target, prop) {
    if (typeof prop !== 'string')
      return Reflect.has(target, prop)
    return resolveProviderId(prop as string) in target
  },
})

// ═══ Proxy Helper ═══════════════════════════════════════════════════

/** Wrap a Record with a Proxy that resolves legacy IDs on read. */
function withLegacyIdResolution<T>(base: Record<string, T>): Record<string, T> {
  return new Proxy(base, {
    get(target, prop) {
      if (typeof prop !== 'string')
        return Reflect.get(target, prop)
      return target[resolveProviderId(prop)]
    },
    has(target, prop) {
      if (typeof prop !== 'string')
        return Reflect.has(target, prop)
      return resolveProviderId(prop as string) in target
    },
  })
}

// ═══ Store ══════════════════════════════════════════════════════════

export const useProvidersStore = defineStore('providers', () => {
  const unifiedStore = useUnifiedProvidersStore()
  const { t } = useI18n()

  // ── Credential ref (delegated to unified store) ──────────────────
  // Detail pages read/write: providers.value[id].apiKey = '...'
  // Use storeToRefs to preserve Ref wrappers for reactive state
  const { providers: providerCredentials, addedProviders } = storeToRefs(unifiedStore)

  // ── Metadata ─────────────────────────────────────────────────────
  const providerMetadata = staticProviderMetadata

  function markProviderAdded(id: string) { unifiedStore.markProviderAdded(resolveProviderId(id)) }
  function unmarkProviderAdded(id: string) { unifiedStore.unmarkProviderAdded(resolveProviderId(id)) }
  function deleteProvider(id: string) { unifiedStore.deleteProvider(resolveProviderId(id)) }
  function initializeProvider(id: string) { unifiedStore.initializeProvider(resolveProviderId(id)) }
  function forceProviderConfigured(id: string) { unifiedStore.forceProviderConfigured(resolveProviderId(id)) }
  function getProviderConfig(id: string) { return unifiedStore.getProviderConfig(resolveProviderId(id)) }

  async function validateProvider(id: string): Promise<boolean> {
    return unifiedStore.validateProvider(resolveProviderId(id))
  }

  async function resetProviderSettings() {
    return unifiedStore.resetProviderSettings()
  }

  // ── Provider Metadata (localized) ────────────────────────────────
  function getProviderMetadata(id: string) {
    const resolved = resolveProviderId(id)
    const metadata = providerMetadata[resolved]
    if (!metadata) {
      throw new Error(`Provider metadata for '${id}' (resolved: '${resolved}') not found`)
    }
    return {
      ...metadata,
      localizedName: t(metadata.nameKey, metadata.name),
      localizedDescription: t(metadata.descriptionKey, metadata.description),
    }
  }

  function getTranscriptionFeatures(id: string) {
    return unifiedStore.getTranscriptionFeatures(resolveProviderId(id))
  }

  // ── Model / Voice Operations ─────────────────────────────────────
  async function fetchModelsForProvider(id: string) {
    return unifiedStore.fetchModelsForProvider(resolveProviderId(id))
  }

  function getModelsForProvider(id: string) {
    return unifiedStore.getModelsForProvider(resolveProviderId(id))
  }

  async function loadModelsForConfiguredProviders() {
    return unifiedStore.loadModelsForConfiguredProviders()
  }

  // ── Instance Management ──────────────────────────────────────────
  async function getProviderInstance<R extends
  | ChatProvider
  | ChatProviderWithExtraOptions
  | EmbedProvider
  | EmbedProviderWithExtraOptions
  | SpeechProvider
  | SpeechProviderWithExtraOptions
  | TranscriptionProvider
  | TranscriptionProviderWithExtraOptions,
  >(id: string): Promise<R> {
    const resolved = resolveProviderId(id)
    const mapping = LEGACY_ID_MAP[id]
    const capability: keyof ProviderCapabilities = mapping?.capability
      ?? (getPrimaryCategory(unifiedProviders[resolved]) === 'embed' ? 'embedding' : getPrimaryCategory(unifiedProviders[resolved]) as keyof ProviderCapabilities)
    return unifiedStore.getProviderInstance(resolved, capability) as Promise<R>
  }

  async function disposeProviderInstance(id: string) {
    return unifiedStore.disposeProviderInstance(resolveProviderId(id))
  }

  // ── Computed State (with legacy ID resolution) ───────────────────
  const configuredProviders = computed(() => withLegacyIdResolution(unifiedStore.configuredProviders))
  const availableProviders = unifiedStore.availableProviders
  const availableModels = computed(() => withLegacyIdResolution(unifiedStore.availableModels))
  const isLoadingModels = computed(() => withLegacyIdResolution(unifiedStore.isLoadingModels))
  const modelLoadError = computed(() => withLegacyIdResolution(unifiedStore.modelLoadError))
  const allAvailableModels = unifiedStore.allAvailableModels

  // ── Metadata Lists ───────────────────────────────────────────────

  function toLegacyShape(p: { id: string, localizedName?: string, localizedDescription?: string, configured?: boolean }): ProviderMetadata & { configured: boolean } {
    const meta = providerMetadata[p.id]
    if (!meta)
      return undefined as unknown as ProviderMetadata & { configured: boolean }
    return {
      ...meta,
      localizedName: p.localizedName ?? t(meta.nameKey, meta.name),
      localizedDescription: p.localizedDescription ?? t(meta.descriptionKey, meta.description),
      configured: p.configured ?? false,
    }
  }

  const allProvidersMetadata = computed(() =>
    unifiedStore.allProvidersMetadata.map(toLegacyShape).filter(Boolean),
  )

  const availableProvidersMetadata = computedAsync<ProviderMetadata[]>(async () =>
    unifiedStore.availableProvidersMetadata.map(toLegacyShape).filter(Boolean), [], { lazy: true })

  // ── Category-Based Lists (bridged from capability-based) ─────────
  const allChatProvidersMetadata = computed(() =>
    unifiedStore.chatProviders.map(toLegacyShape).filter(Boolean),
  )
  const allAudioSpeechProvidersMetadata = computed(() =>
    unifiedStore.speechProviders.map(toLegacyShape).filter(Boolean),
  )
  const allAudioTranscriptionProvidersMetadata = computed(() =>
    unifiedStore.transcriptionProviders.map(toLegacyShape).filter(Boolean),
  )
  const allEmbeddingProvidersMetadata = computed(() =>
    unifiedStore.embeddingProviders.map(toLegacyShape).filter(Boolean),
  )

  // ── Configured Variants ──────────────────────────────────────────
  const configuredChatProvidersMetadata = computed(() =>
    allChatProvidersMetadata.value.filter(m => unifiedStore.configuredProviders[m.id]),
  )
  const configuredSpeechProvidersMetadata = computed(() =>
    allAudioSpeechProvidersMetadata.value.filter(m => unifiedStore.configuredProviders[m.id]),
  )
  const configuredTranscriptionProvidersMetadata = computed(() =>
    allAudioTranscriptionProvidersMetadata.value.filter(m => unifiedStore.configuredProviders[m.id]),
  )
  const configuredEmbeddingProvidersMetadata = computed(() =>
    allEmbeddingProvidersMetadata.value.filter(m => unifiedStore.configuredProviders[m.id]),
  )

  // ── Persisted Variants (providers explicitly added or with dirty config) ──
  function isProviderConfigDirty(providerId: string) {
    const config = providerCredentials.value[providerId]
    if (!config)
      return false
    const defaultOptions = unifiedStore.getDefaultConfig(providerId)
    return JSON.stringify(config) !== JSON.stringify(defaultOptions)
  }

  function shouldListProvider(providerId: string) {
    return !!addedProviders.value[providerId] || isProviderConfigDirty(providerId)
  }

  const persistedProvidersMetadata = computed(() =>
    availableProvidersMetadata.value.filter(m => shouldListProvider(m.id)),
  )
  const persistedChatProvidersMetadata = computed(() =>
    persistedProvidersMetadata.value.filter(m => m.category === 'chat'),
  )
  const persistedSpeechProvidersMetadata = computed(() =>
    persistedProvidersMetadata.value.filter(m => m.category === 'speech'),
  )
  const persistedTranscriptionProvidersMetadata = computed(() =>
    persistedProvidersMetadata.value.filter(m => m.category === 'transcription'),
  )
  const persistedEmbeddingProvidersMetadata = computed(() =>
    persistedProvidersMetadata.value.filter(m => m.category === 'embed'),
  )

  // ═══ Public API (identical shape to old store) ════════════════════
  return {
    providers: providerCredentials,
    getProviderConfig,
    addedProviders,
    markProviderAdded,
    unmarkProviderAdded,
    deleteProvider,
    availableProviders,
    configuredProviders,
    providerMetadata,
    getProviderMetadata,
    getTranscriptionFeatures,
    allProvidersMetadata,
    initializeProvider,
    validateProvider,
    availableModels,
    isLoadingModels,
    modelLoadError,
    fetchModelsForProvider,
    getModelsForProvider,
    allAvailableModels,
    loadModelsForConfiguredProviders,
    getProviderInstance,
    disposeProviderInstance,
    resetProviderSettings,
    forceProviderConfigured,
    availableProvidersMetadata,
    allChatProvidersMetadata,
    allAudioSpeechProvidersMetadata,
    allAudioTranscriptionProvidersMetadata,
    allEmbeddingProvidersMetadata,
    configuredChatProvidersMetadata,
    configuredSpeechProvidersMetadata,
    configuredTranscriptionProvidersMetadata,
    configuredEmbeddingProvidersMetadata,
    persistedProvidersMetadata,
    persistedChatProvidersMetadata,
    persistedSpeechProvidersMetadata,
    persistedTranscriptionProvidersMetadata,
    persistedEmbeddingProvidersMetadata,
  }
})
