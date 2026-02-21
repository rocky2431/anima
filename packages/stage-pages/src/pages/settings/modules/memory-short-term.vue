<script setup lang="ts">
import type { ContextMessage } from '@proj-airi/stage-ui/types/chat'

import { useChatContextStore } from '@proj-airi/stage-ui/stores/chat/context-store'
import { useIntervalFn } from '@vueuse/core'
import { computed, onMounted, ref } from 'vue'

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
  <!-- Stats header -->
  <div bg="neutral-50 dark:[rgba(0,0,0,0.3)]" flex="~ col gap-4" mb-4 rounded-xl p-4>
    <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-500">
      Short-Term Memory (Context Window)
    </h2>
    <div class="flex flex-wrap items-center gap-3">
      <div class="flex items-center gap-2 rounded-lg bg-white px-3 py-2 dark:bg-neutral-800/50">
        <div class="i-solar:layers-bold-duotone text-lg" />
        <span class="text-sm font-medium">{{ sourceCount }} sources</span>
      </div>
      <div class="flex items-center gap-2 rounded-lg bg-white px-3 py-2 dark:bg-neutral-800/50">
        <div class="i-solar:documents-bold-duotone text-lg" />
        <span class="text-sm font-medium">{{ entryCount }} entries</span>
      </div>
      <div class="flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs text-neutral-400 dark:bg-neutral-800/50">
        <div class="i-solar:refresh-circle-line-duotone text-sm" />
        Auto-refreshes every 2s
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
        No context data in the current window
      </p>
      <p class="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
        Context entries will appear here as modules provide data
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

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.memory-short-term.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
