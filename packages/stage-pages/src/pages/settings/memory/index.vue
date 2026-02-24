<script setup lang="ts">
import type { ContextMessage } from '@proj-airi/stage-ui/types/chat'

import { MemoryManager } from '@proj-airi/stage-ui/components'
import { useChatContextStore } from '@proj-airi/stage-ui/stores/chat/context-store'
import { useIntervalFn } from '@vueuse/core'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// Tab state
const activeTab = ref<'long-term' | 'context'>('long-term')

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
