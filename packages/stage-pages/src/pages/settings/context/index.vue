<script setup lang="ts">
import { useContextDisplayStore } from '@anase/stage-ui/stores/modules/context-display'
import { storeToRefs } from 'pinia'

const contextDisplayStore = useContextDisplayStore()
const { latestEntries, entryCount, laneGroups } = storeToRefs(contextDisplayStore)

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString()
}
</script>

<template>
  <div :class="['flex flex-col gap-4 p-4']">
    <div :class="['flex items-center justify-between']">
      <h2 :class="['text-lg font-semibold']">
        {{ $t('settings.pages.context.view_title') }}
      </h2>
      <span :class="['text-sm op-60']">
        {{ $t('settings.pages.context.entry_count', { count: entryCount }) }}
      </span>
    </div>

    <div v-if="latestEntries.length === 0" :class="['flex items-center justify-center py-12 op-40']">
      <p>{{ $t('settings.pages.context.empty') }}</p>
    </div>

    <template v-else>
      <div v-for="[lane, entries] in Object.entries(laneGroups)" :key="lane" :class="['flex flex-col gap-2']">
        <h3 :class="['text-sm font-medium op-70']">
          {{ $t('settings.pages.context.lane') }}: {{ lane }}
        </h3>
        <div
          v-for="entry in entries.slice(0, 10)"
          :key="entry.id"
          :class="['rounded-lg border border-base p-3 bg-base']"
        >
          <div :class="['flex items-center justify-between mb-1']">
            <span :class="['text-xs font-mono op-50']">{{ entry.contextId }}</span>
            <span :class="['text-xs op-40']">{{ formatTimestamp(entry.timestamp) }}</span>
          </div>
          <p :class="['text-sm']">
            {{ entry.text }}
          </p>
          <div v-if="entry.ideas?.length" :class="['mt-1 flex flex-wrap gap-1']">
            <span
              v-for="idea in entry.ideas"
              :key="idea"
              :class="['text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary']"
            >
              {{ idea }}
            </span>
          </div>
        </div>
      </div>
    </template>

    <button
      v-if="entryCount > 0"
      :class="['self-center text-sm op-60 hover:op-100 transition-opacity']"
      @click="contextDisplayStore.clearEntries()"
    >
      {{ $t('settings.pages.context.clear') }}
    </button>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.context.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.context.description
  icon: i-solar:eye-bold-duotone
  settingsEntry: true
  order: 11
  stageTransition:
    name: slide
</route>
