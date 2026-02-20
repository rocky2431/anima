<script setup lang="ts">
import type { MemoryCategory } from '../../../types/memory'

import { Button, FieldInput } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

import { useMemoryModuleStore } from '../../../stores/modules/memory'
import { MEMORY_CATEGORIES } from '../../../types/memory'

const { t } = useI18n()
const memoryStore = useMemoryModuleStore()
const { searchQuery, selectedCategory, selectedMemory, filteredMemories, memoryCount } = storeToRefs(memoryStore)

function getCategoryLabel(category: MemoryCategory | 'all'): string {
  return t(`settings.pages.memory.categories.${category}`)
}

function getImportanceColor(importance: number): string {
  if (importance >= 8)
    return 'text-red-500'
  if (importance >= 5)
    return 'text-amber-500'
  return 'text-neutral-400'
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString()
}

function handleDeleteSelected(): void {
  if (selectedMemory.value) {
    memoryStore.deleteMemory(selectedMemory.value.id)
  }
}
</script>

<template>
  <div :class="['flex flex-col gap-6']">
    <!-- Header with stats -->
    <div :class="['flex items-center justify-between']">
      <div :class="['text-sm', 'text-neutral-500']">
        {{ t('settings.pages.memory.count', { count: memoryCount }) }}
      </div>
    </div>

    <!-- Search and filter -->
    <div :class="['flex flex-col gap-3', 'sm:flex-row sm:items-center']">
      <div :class="['flex-1']">
        <FieldInput
          v-model="searchQuery"
          :placeholder="t('settings.pages.memory.search_placeholder')"
        />
      </div>
      <div :class="['flex gap-1.5 flex-wrap']">
        <button
          v-for="cat in ['all', ...MEMORY_CATEGORIES] as const"
          :key="cat"
          :class="[
            'px-3 py-1.5 rounded-md text-xs',
            'transition-colors',
            selectedCategory === cat
              ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
              : 'bg-neutral-200 dark:bg-neutral-700',
          ]"
          @click="selectedCategory = cat"
        >
          {{ getCategoryLabel(cat) }}
        </button>
      </div>
    </div>

    <!-- Memory list -->
    <div
      v-if="filteredMemories.length > 0"
      :class="['flex flex-col gap-2']"
    >
      <div
        v-for="memory in filteredMemories"
        :key="memory.id"
        :class="[
          'flex items-start justify-between gap-3',
          'rounded-lg px-4 py-3',
          'bg-neutral-50 dark:bg-neutral-800',
          'transition-all duration-250',
          'cursor-pointer',
          selectedMemory?.id === memory.id ? 'ring-2 ring-neutral-300 dark:ring-neutral-600' : '',
        ]"
        @click="memoryStore.selectMemory(memory.id)"
      >
        <div :class="['flex-1 min-w-0']">
          <div :class="['text-sm', 'line-clamp-2']">
            {{ memory.content }}
          </div>
          <div :class="['flex items-center gap-2 mt-1.5']">
            <span :class="['text-xs', 'text-neutral-400']">
              {{ getCategoryLabel(memory.category) }}
            </span>
            <span :class="['text-xs', getImportanceColor(memory.importance)]">
              {{ t('settings.pages.memory.importance', { score: memory.importance }) }}
            </span>
            <span :class="['text-xs', 'text-neutral-400']">
              {{ formatDate(memory.createdAt) }}
            </span>
          </div>
        </div>
        <button
          :class="[
            'p-1.5 rounded-md shrink-0',
            'text-neutral-500 hover:text-red-500',
            'transition-colors',
          ]"
          @click.stop="memoryStore.deleteMemory(memory.id)"
        >
          <div :class="['i-solar:trash-bin-trash-bold-duotone', 'text-base']" />
        </button>
      </div>
    </div>

    <!-- Empty state -->
    <div
      v-else
      :class="[
        'flex flex-col items-center justify-center',
        'py-12 rounded-lg',
        'bg-neutral-50 dark:bg-neutral-800',
        'text-neutral-500',
      ]"
    >
      <div :class="['i-solar:brain-bold-duotone', 'text-4xl mb-3 opacity-50']" />
      <div :class="['text-sm']">
        {{ t('settings.pages.memory.empty') }}
      </div>
    </div>

    <!-- Detail panel -->
    <div
      v-if="selectedMemory"
      :class="[
        'flex flex-col gap-3',
        'rounded-lg p-4',
        'bg-neutral-100 dark:bg-neutral-900',
        'border border-neutral-200 dark:border-neutral-700',
      ]"
    >
      <div :class="['flex items-center justify-between']">
        <div :class="['text-sm font-medium']">
          {{ t('settings.pages.memory.detail') }}
        </div>
        <button
          :class="['text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors']"
          @click="memoryStore.clearSelection()"
        >
          <div :class="['i-solar:close-circle-bold-duotone', 'text-lg']" />
        </button>
      </div>
      <p :class="['text-sm', 'text-neutral-700 dark:text-neutral-300']">
        {{ selectedMemory.content }}
      </p>
      <div :class="['flex items-center gap-3 text-xs text-neutral-500']">
        <span>{{ getCategoryLabel(selectedMemory.category) }}</span>
        <span>{{ t('settings.pages.memory.importance', { score: selectedMemory.importance }) }}</span>
        <span>{{ selectedMemory.sourceDate }}</span>
      </div>
      <div :class="['flex justify-end']">
        <Button @click="handleDeleteSelected">
          <div :class="['i-solar:trash-bin-trash-bold-duotone', 'text-base']" />
          {{ t('settings.pages.memory.delete') }}
        </Button>
      </div>
    </div>
  </div>
</template>
