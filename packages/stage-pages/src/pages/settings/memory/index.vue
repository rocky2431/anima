<script setup lang="ts">
import type { ContextMessage } from '@proj-airi/stage-ui/types/chat'

import { MemoryManager } from '@proj-airi/stage-ui/components'
import { useChatContextStore } from '@proj-airi/stage-ui/stores/chat/context-store'
import { useMemoryModuleStore } from '@proj-airi/stage-ui/stores/modules/memory'
import { useUnifiedProvidersStore } from '@proj-airi/stage-ui/stores/unified-providers'
import { useIntervalFn } from '@vueuse/core'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// Tab state
const activeTab = ref<'long-term' | 'context'>('long-term')

// Embedding config
const memoryStore = useMemoryModuleStore()
const unifiedStore = useUnifiedProvidersStore()

const embeddingProviderOptions = computed(() =>
  unifiedStore.embeddingProviders
    .filter(p => p.configured)
    .map(p => ({ id: p.id, name: p.localizedName || p.name })),
)

const embeddingModelOptions = ref<Array<{ id: string, name: string }>>([])
const isLoadingModels = ref(false)

watch(() => memoryStore.embeddingProvider, async (providerId) => {
  embeddingModelOptions.value = []
  if (!providerId)
    return

  isLoadingModels.value = true
  const models = await unifiedStore.fetchModelsForProvider(providerId, 'embedding')
  embeddingModelOptions.value = models.map(m => ({ id: m.id, name: m.name || m.id }))
  isLoadingModels.value = false
}, { immediate: true })

function onEmbeddingProviderChange(providerId: string): void {
  memoryStore.embeddingProvider = providerId
  memoryStore.embeddingModel = ''
}

function onEmbeddingModelChange(model: string): void {
  memoryStore.embeddingModel = model
  memoryStore.sendEmbeddingConfig()
}

// Context window (short-term) state
const contextStore = useChatContextStore()
const contextSnapshot = ref<Record<string, ContextMessage[]>>({})

function refreshSnapshot() {
  contextSnapshot.value = { ...contextStore.getContextsSnapshot() }
}

onMounted(() => {
  refreshSnapshot()
})

useIntervalFn(refreshSnapshot, 2000)

interface FlatContextEntry {
  source: string
  content: string
  createdAt: number
}

const flatEntries = computed<FlatContextEntry[]>(() => {
  const entries: FlatContextEntry[] = []
  for (const [source, messages] of Object.entries(contextSnapshot.value)) {
    for (const msg of messages) {
      const content = typeof msg.content === 'string'
        ? msg.content
        : Array.isArray(msg.content)
          ? msg.content.map((p: any) => p.text ?? '').join(' ')
          : String(msg.content ?? '')
      entries.push({
        source,
        content,
        createdAt: msg.createdAt,
      })
    }
  }
  return entries.sort((a, b) => b.createdAt - a.createdAt)
})

const sourceCount = computed(() => Object.keys(contextSnapshot.value).length)
const entryCount = computed(() => flatEntries.value.length)

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function truncate(text: string, max: number): string {
  if (text.length <= max)
    return text
  return `${text.slice(0, max)}...`
}
</script>

<template>
  <!-- Tab switcher -->
  <div class="mb-4 flex gap-2">
    <button
      :class="[
        'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
        activeTab === 'long-term'
          ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
          : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700',
      ]"
      @click="activeTab = 'long-term'"
    >
      <div class="flex items-center gap-2">
        <div class="i-solar:brain-bold-duotone text-base" />
        {{ t('settings.pages.memory.tabs.long_term') }}
      </div>
    </button>
    <button
      :class="[
        'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
        activeTab === 'context'
          ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
          : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700',
      ]"
      @click="activeTab = 'context'"
    >
      <div class="flex items-center gap-2">
        <div class="i-solar:layers-bold-duotone text-base" />
        {{ t('settings.pages.memory.tabs.context_window') }}
      </div>
    </button>
  </div>

  <!-- Embedding configuration -->
  <div v-if="activeTab === 'long-term'" class="mb-4 rounded-xl bg-neutral-50 p-4 dark:bg-[rgba(0,0,0,0.3)]">
    <div class="mb-3 flex items-center gap-2">
      <div class="i-solar:graph-new-bold-duotone text-lg" />
      <span class="text-sm font-semibold">{{ t('settings.pages.memory.embedding.title') }}</span>
      <span
        :class="[
          'ml-auto rounded-full px-2 py-0.5 text-xs',
          memoryStore.embeddingConfigured
            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
            : 'bg-neutral-200 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400',
        ]"
      >
        {{ memoryStore.embeddingConfigured
          ? t('settings.pages.memory.embedding.status.configured')
          : t('settings.pages.memory.embedding.status.not_configured')
        }}
      </span>
    </div>
    <p class="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
      {{ t('settings.pages.memory.embedding.description') }}
    </p>

    <div class="flex flex-col gap-3 sm:flex-row">
      <!-- Provider select -->
      <div class="flex-1">
        <label class="mb-1 block text-xs text-neutral-500 font-medium">
          {{ t('settings.pages.memory.embedding.provider') }}
        </label>
        <select
          :value="memoryStore.embeddingProvider"
          class="w-full border border-neutral-200 rounded-lg bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
          @change="onEmbeddingProviderChange(($event.target as HTMLSelectElement).value)"
        >
          <option value="">
            {{ t('settings.pages.memory.embedding.select_provider') }}
          </option>
          <option v-for="p in embeddingProviderOptions" :key="p.id" :value="p.id">
            {{ p.name }}
          </option>
        </select>
      </div>

      <!-- Model select -->
      <div class="flex-1">
        <label class="mb-1 block text-xs text-neutral-500 font-medium">
          {{ t('settings.pages.memory.embedding.model') }}
        </label>
        <select
          :value="memoryStore.embeddingModel"
          :disabled="!memoryStore.embeddingProvider || isLoadingModels"
          class="w-full border border-neutral-200 rounded-lg bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 disabled:opacity-50"
          @change="onEmbeddingModelChange(($event.target as HTMLSelectElement).value)"
        >
          <option value="">
            {{ isLoadingModels ? '...' : t('settings.pages.memory.embedding.select_model') }}
          </option>
          <option v-for="m in embeddingModelOptions" :key="m.id" :value="m.id">
            {{ m.name }}
          </option>
        </select>
      </div>
    </div>

    <p v-if="embeddingProviderOptions.length === 0" class="mt-2 text-xs text-amber-600 dark:text-amber-400">
      {{ t('settings.pages.memory.embedding.hint') }}
    </p>
  </div>

  <!-- Long-term memory tab -->
  <MemoryManager v-if="activeTab === 'long-term'" />

  <!-- Context window tab -->
  <template v-else>
    <!-- Stats header -->
    <div bg="neutral-50 dark:[rgba(0,0,0,0.3)]" flex="~ col gap-4" mb-4 rounded-xl p-4>
      <div class="flex flex-wrap items-center gap-3">
        <div class="flex items-center gap-2 rounded-lg bg-white px-3 py-2 dark:bg-neutral-800/50">
          <div class="i-solar:layers-bold-duotone text-lg" />
          <span class="text-sm font-medium">{{ sourceCount }} {{ t('settings.pages.memory.context.sources') }}</span>
        </div>
        <div class="flex items-center gap-2 rounded-lg bg-white px-3 py-2 dark:bg-neutral-800/50">
          <div class="i-solar:documents-bold-duotone text-lg" />
          <span class="text-sm font-medium">{{ entryCount }} {{ t('settings.pages.memory.context.entries') }}</span>
        </div>
        <div class="flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs text-neutral-400 dark:bg-neutral-800/50">
          <div class="i-solar:refresh-circle-line-duotone text-sm" />
          {{ t('settings.pages.memory.context.auto_refresh') }}
        </div>
      </div>
    </div>

    <!-- Context entries list -->
    <div bg="neutral-50 dark:[rgba(0,0,0,0.3)]" flex="~ col gap-3" rounded-xl p-4>
      <!-- Empty state -->
      <div
        v-if="flatEntries.length === 0"
        class="flex flex-col items-center justify-center py-12"
      >
        <div class="i-solar:layers-bold-duotone mb-3 text-4xl text-neutral-300 dark:text-neutral-600" />
        <p class="text-sm text-neutral-500 dark:text-neutral-400">
          {{ t('settings.pages.memory.context.empty') }}
        </p>
        <p class="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
          {{ t('settings.pages.memory.context.empty_hint') }}
        </p>
      </div>

      <!-- Entry cards -->
      <div
        v-for="(entry, index) in flatEntries"
        :key="`${entry.source}-${entry.createdAt}-${index}`"
        class="rounded-lg bg-white p-3 dark:bg-neutral-800/50"
      >
        <div class="mb-1.5 flex items-center justify-between">
          <span class="inline-flex items-center gap-1.5 rounded-md bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 font-medium dark:bg-neutral-700/60 dark:text-neutral-300">
            <div class="i-solar:plug-circle-bold-duotone text-xs" />
            {{ entry.source }}
          </span>
          <span class="text-xs text-neutral-400">
            {{ formatTime(entry.createdAt) }}
          </span>
        </div>
        <p class="text-sm text-neutral-600 leading-relaxed dark:text-neutral-400">
          {{ truncate(entry.content, 200) }}
        </p>
      </div>
    </div>
  </template>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.memory.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.memory.description
  icon: i-solar:brain-bold-duotone
  settingsEntry: true
  order: 5
  stageTransition:
    name: slide
</route>
