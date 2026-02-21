<script setup lang="ts">
import type { MemoryCategory } from '@proj-airi/stage-ui/types/memory'

import { useMemoryModuleStore } from '@proj-airi/stage-ui/stores/modules/memory'
import { MEMORY_CATEGORIES } from '@proj-airi/stage-ui/types/memory'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted } from 'vue'

const memoryStore = useMemoryModuleStore()
const {
  filteredMemories,
  memoryCount,
  searchQuery,
  selectedCategory,
  selectedMemory,
  isSearching,
  memories,
} = storeToRefs(memoryStore)

onMounted(() => {
  memoryStore.initialize()
})

onUnmounted(() => {
  memoryStore.dispose()
})

const categoryLabels: Record<MemoryCategory, string> = {
  preference: 'Preference',
  event: 'Event',
  habit: 'Habit',
  goal: 'Goal',
  emotion: 'Emotion',
}

const categoryIcons: Record<MemoryCategory, string> = {
  preference: 'i-solar:star-bold-duotone',
  event: 'i-solar:calendar-bold-duotone',
  habit: 'i-solar:refresh-circle-bold-duotone',
  goal: 'i-solar:target-bold-duotone',
  emotion: 'i-solar:heart-bold-duotone',
}

const categoryCounts = computed(() => {
  const counts: Record<string, number> = {}
  for (const cat of MEMORY_CATEGORIES) {
    counts[cat] = memories.value.filter(m => m.category === cat).length
  }
  return counts
})

function formatDate(timestamp: number | string): string {
  const date = typeof timestamp === 'number' ? new Date(timestamp) : new Date(timestamp)
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function importanceStars(importance: number): number {
  return Math.max(1, Math.min(5, Math.round(importance * 5)))
}

function handleDelete(id: string) {
  memoryStore.deleteMemory(id)
}

function handleSelect(id: string) {
  if (selectedMemory.value?.id === id) {
    memoryStore.clearSelection()
  }
  else {
    memoryStore.selectMemory(id)
  }
}
</script>

<template>
  <!-- Stats header -->
  <div bg="neutral-50 dark:[rgba(0,0,0,0.3)]" flex="~ col gap-4" mb-4 rounded-xl p-4>
    <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-500">
      Long-Term Memory
    </h2>
    <div class="flex flex-wrap items-center gap-3">
      <div class="flex items-center gap-2 rounded-lg bg-white px-3 py-2 dark:bg-neutral-800/50">
        <div class="i-solar:database-bold-duotone text-lg" />
        <span class="text-sm font-medium">{{ memoryCount }} memories</span>
      </div>
      <div
        v-for="cat in MEMORY_CATEGORIES"
        :key="cat"
        class="flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 dark:bg-neutral-800/50"
      >
        <div :class="categoryIcons[cat]" class="text-sm" />
        <span class="text-xs font-medium">{{ categoryLabels[cat] }}</span>
        <span class="text-xs text-neutral-400">{{ categoryCounts[cat] }}</span>
      </div>
    </div>
  </div>

  <!-- Search + filter -->
  <div bg="neutral-50 dark:[rgba(0,0,0,0.3)]" flex="~ col gap-4" mb-4 rounded-xl p-4>
    <div class="relative">
      <div class="pointer-events-none absolute inset-y-0 left-3 flex items-center">
        <div class="i-solar:magnifer-line-duotone text-neutral-400" />
      </div>
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search memories..."
        class="w-full border border-neutral-200 rounded-lg bg-white py-2 pl-9 pr-3 text-sm outline-none dark:border-neutral-700 focus:border-primary-400 dark:bg-neutral-800/50 dark:focus:border-primary-500"
      >
      <div v-if="isSearching" class="absolute inset-y-0 right-3 flex items-center">
        <div class="i-solar:spinner-line-duotone animate-spin text-neutral-400" />
      </div>
    </div>

    <!-- Category filter tabs -->
    <div class="flex flex-wrap gap-2">
      <button
        :class="[
          'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
          selectedCategory === 'all'
            ? 'bg-primary-500 text-white'
            : 'bg-white text-neutral-600 dark:bg-neutral-800/50 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700/50',
        ]"
        @click="selectedCategory = 'all'"
      >
        All
      </button>
      <button
        v-for="cat in MEMORY_CATEGORIES"
        :key="cat"
        :class="[
          'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
          selectedCategory === cat
            ? 'bg-primary-500 text-white'
            : 'bg-white text-neutral-600 dark:bg-neutral-800/50 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700/50',
        ]"
        @click="selectedCategory = cat"
      >
        <div :class="categoryIcons[cat]" class="text-sm" />
        {{ categoryLabels[cat] }}
      </button>
    </div>
  </div>

  <!-- Memory list + detail panel -->
  <div class="flex flex-col gap-4 lg:flex-row">
    <!-- Memory card list -->
    <div class="flex-1" flex="~ col gap-3">
      <!-- Empty state -->
      <div
        v-if="filteredMemories.length === 0"
        bg="neutral-50 dark:[rgba(0,0,0,0.3)]"
        class="flex flex-col items-center justify-center rounded-xl py-12"
      >
        <div class="i-solar:bookmark-bold-duotone mb-3 text-4xl text-neutral-300 dark:text-neutral-600" />
        <p class="text-sm text-neutral-500 dark:text-neutral-400">
          {{ searchQuery ? 'No memories match your search' : 'No memories stored yet' }}
        </p>
      </div>

      <!-- Memory cards -->
      <button
        v-for="memory in filteredMemories"
        :key="memory.id"
        :class="[
          'w-full cursor-pointer rounded-xl p-4 text-left transition-all',
          selectedMemory?.id === memory.id
            ? 'bg-primary-50 ring-2 ring-primary-400 dark:bg-primary-900/20 dark:ring-primary-500'
            : 'bg-neutral-50 dark:bg-[rgba(0,0,0,0.3)] hover:bg-neutral-100 dark:hover:bg-neutral-800/60',
        ]"
        @click="handleSelect(memory.id)"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <p class="line-clamp-2 text-sm">
              {{ memory.content }}
            </p>
            <div class="mt-2 flex flex-wrap items-center gap-2">
              <span
                :class="[
                  'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium',
                  'bg-neutral-200/60 text-neutral-600 dark:bg-neutral-700/60 dark:text-neutral-300',
                ]"
              >
                <div :class="categoryIcons[memory.category]" class="text-xs" />
                {{ categoryLabels[memory.category] }}
              </span>
              <span class="text-xs text-neutral-400">
                {{ formatDate(memory.createdAt) }}
              </span>
            </div>
          </div>
          <div class="flex shrink-0 gap-0.5">
            <div
              v-for="star in 5"
              :key="star"
              :class="[
                'text-xs',
                star <= importanceStars(memory.importance)
                  ? 'i-solar:star-bold text-amber-400'
                  : 'i-solar:star-line-duotone text-neutral-300 dark:text-neutral-600',
              ]"
            />
          </div>
        </div>
      </button>
    </div>

    <!-- Detail panel -->
    <div
      v-if="selectedMemory"
      bg="neutral-50 dark:[rgba(0,0,0,0.3)]"
      class="w-full rounded-xl p-4 lg:w-80"
      flex="~ col gap-3"
    >
      <div class="flex items-center justify-between">
        <h3 class="text-sm text-neutral-700 font-semibold dark:text-neutral-300">
          Memory Detail
        </h3>
        <button
          class="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-200 dark:hover:bg-neutral-700"
          @click="memoryStore.clearSelection()"
        >
          <div class="i-solar:close-circle-line-duotone text-lg" />
        </button>
      </div>

      <div class="border-t border-neutral-200 pt-3 dark:border-neutral-700">
        <p class="text-sm leading-relaxed">
          {{ selectedMemory.content }}
        </p>
      </div>

      <div class="flex flex-col gap-2 text-xs text-neutral-500">
        <div class="flex items-center justify-between">
          <span>Category</span>
          <span class="inline-flex items-center gap-1 rounded-md bg-neutral-200/60 px-2 py-0.5 text-neutral-600 font-medium dark:bg-neutral-700/60 dark:text-neutral-300">
            <div :class="categoryIcons[selectedMemory.category]" class="text-xs" />
            {{ categoryLabels[selectedMemory.category] }}
          </span>
        </div>
        <div class="flex items-center justify-between">
          <span>Importance</span>
          <div class="flex gap-0.5">
            <div
              v-for="star in 5"
              :key="star"
              :class="[
                'text-xs',
                star <= importanceStars(selectedMemory.importance)
                  ? 'i-solar:star-bold text-amber-400'
                  : 'i-solar:star-line-duotone text-neutral-300 dark:text-neutral-600',
              ]"
            />
          </div>
        </div>
        <div class="flex items-center justify-between">
          <span>Source Date</span>
          <span>{{ selectedMemory.sourceDate }}</span>
        </div>
        <div class="flex items-center justify-between">
          <span>Created</span>
          <span>{{ formatDate(selectedMemory.createdAt) }}</span>
        </div>
      </div>

      <button
        class="mt-2 flex items-center justify-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 font-medium transition-colors dark:bg-red-900/20 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900/40"
        @click="handleDelete(selectedMemory!.id)"
      >
        <div class="i-solar:trash-bin-trash-bold-duotone text-base" />
        Delete Memory
      </button>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.memory-long-term.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
