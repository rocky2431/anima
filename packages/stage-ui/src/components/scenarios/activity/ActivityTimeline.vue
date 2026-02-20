<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useActivityModuleStore } from '../../../stores/modules/activity'

const { t } = useI18n()
const activityStore = useActivityModuleStore()
const { todaySummary, totalWorkDuration, appBreakdown, highlights } = storeToRefs(activityStore)

const MS_PER_HOUR = 3_600_000
const MS_PER_MINUTE = 60_000

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / MS_PER_HOUR)
  const minutes = Math.floor((ms % MS_PER_HOUR) / MS_PER_MINUTE)
  if (hours > 0)
    return `${hours}h ${minutes}m`
  return `${minutes}m`
}

const formattedDuration = computed(() => formatDuration(totalWorkDuration.value))

function getBarWidth(durationMs: number): string {
  if (totalWorkDuration.value === 0)
    return '0%'
  const pct = Math.round((durationMs / totalWorkDuration.value) * 100)
  return `${pct}%`
}
</script>

<template>
  <div :class="['flex flex-col gap-6']">
    <!-- Summary header -->
    <div
      v-if="todaySummary"
      :class="[
        'flex flex-col gap-3',
        'rounded-lg p-4',
        'bg-neutral-50 dark:bg-neutral-800',
      ]"
    >
      <div :class="['flex items-center justify-between']">
        <div :class="['text-sm font-medium']">
          {{ t('settings.pages.activity.today_summary') }}
        </div>
        <div :class="['text-sm text-neutral-500']">
          {{ todaySummary.date }}
        </div>
      </div>
      <div :class="['flex items-baseline gap-2']">
        <span :class="['text-2xl font-semibold']">{{ formattedDuration }}</span>
        <span :class="['text-sm text-neutral-500']">{{ t('settings.pages.activity.total_work') }}</span>
      </div>
    </div>

    <!-- Highlights -->
    <div
      v-if="highlights.length > 0"
      :class="['flex flex-col gap-2']"
    >
      <div :class="['text-sm font-medium text-neutral-700 dark:text-neutral-300']">
        {{ t('settings.pages.activity.highlights') }}
      </div>
      <ul :class="['flex flex-col gap-1.5']">
        <li
          v-for="(highlight, index) in highlights"
          :key="index"
          :class="[
            'flex items-start gap-2',
            'text-sm',
            'text-neutral-600 dark:text-neutral-400',
          ]"
        >
          <div :class="['i-solar:star-bold-duotone', 'text-amber-500 shrink-0 mt-0.5']" />
          {{ highlight }}
        </li>
      </ul>
    </div>

    <!-- App breakdown -->
    <div
      v-if="appBreakdown.length > 0"
      :class="['flex flex-col gap-3']"
    >
      <div :class="['text-sm font-medium text-neutral-700 dark:text-neutral-300']">
        {{ t('settings.pages.activity.breakdown') }}
      </div>
      <div :class="['flex flex-col gap-2']">
        <div
          v-for="entry in appBreakdown"
          :key="entry.app"
          :class="['flex flex-col gap-1']"
        >
          <div :class="['flex items-center justify-between']">
            <div :class="['flex items-center gap-2']">
              <div :class="['i-solar:monitor-bold-duotone', 'text-neutral-400']" />
              <span :class="['text-sm']">{{ entry.app }}</span>
            </div>
            <span :class="['text-xs text-neutral-500']">{{ formatDuration(entry.durationMs) }}</span>
          </div>
          <div :class="['h-1.5 rounded-full', 'bg-neutral-200 dark:bg-neutral-700', 'overflow-hidden']">
            <div
              :class="['h-full rounded-full', 'bg-blue-500']"
              :style="{ width: getBarWidth(entry.durationMs) }"
            />
          </div>
          <div :class="['text-xs text-neutral-400']">
            {{ entry.description }}
          </div>
        </div>
      </div>
    </div>

    <!-- Personal note -->
    <div
      v-if="todaySummary?.personalNote"
      :class="[
        'rounded-lg p-4',
        'bg-neutral-50 dark:bg-neutral-800',
        'border-l-4 border-blue-400',
      ]"
    >
      <div :class="['text-sm italic text-neutral-600 dark:text-neutral-400']">
        {{ todaySummary.personalNote }}
      </div>
    </div>

    <!-- Empty state -->
    <div
      v-if="!todaySummary"
      :class="[
        'flex flex-col items-center justify-center',
        'py-12 rounded-lg',
        'bg-neutral-50 dark:bg-neutral-800',
        'text-neutral-500',
      ]"
    >
      <div :class="['i-solar:chart-bold-duotone', 'text-4xl mb-3 opacity-50']" />
      <div :class="['text-sm']">
        {{ t('settings.pages.activity.empty') }}
      </div>
    </div>
  </div>
</template>
