<script setup lang="ts">
import { FieldInput } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

import { useSkillsModuleStore } from '../../../stores/modules/skills'

const { t } = useI18n()
const skillsStore = useSkillsModuleStore()
const { skills, searchQuery, filteredSkills, activeCount } = storeToRefs(skillsStore)

function getSourceBadgeClass(source: 'builtin' | 'user'): string {
  return source === 'builtin'
    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
    : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
}
</script>

<template>
  <div :class="['flex flex-col gap-6']">
    <!-- Header with stats -->
    <div :class="['flex items-center justify-between']">
      <div :class="['flex items-center gap-2']">
        <div :class="['text-sm', 'text-neutral-500']">
          {{ t('settings.pages.skills.total', { count: skills.length }) }}
        </div>
        <div
          v-if="activeCount > 0"
          :class="['text-xs', 'text-green-600 dark:text-green-400']"
        >
          {{ t('settings.pages.skills.active_count', { count: activeCount }) }}
        </div>
      </div>
    </div>

    <!-- Search -->
    <FieldInput
      v-model="searchQuery"
      :placeholder="t('settings.pages.skills.search_placeholder')"
    />

    <!-- Skills list -->
    <div
      v-if="filteredSkills.length > 0"
      :class="['flex flex-col gap-2']"
    >
      <div
        v-for="skill in filteredSkills"
        :key="skill.id"
        :class="[
          'flex items-center justify-between',
          'rounded-lg px-4 py-3',
          'bg-neutral-50 dark:bg-neutral-800',
          'transition-all duration-250',
        ]"
      >
        <div :class="['flex-1 min-w-0']">
          <div :class="['flex items-center gap-2']">
            <div :class="['text-sm font-medium']">
              {{ skill.name }}
            </div>
            <span
              :class="[
                'text-xs px-1.5 py-0.5 rounded',
                getSourceBadgeClass(skill.source),
              ]"
            >
              {{ skill.source }}
            </span>
            <span :class="['text-xs text-neutral-400']">
              v{{ skill.version }}
            </span>
          </div>
          <div :class="['text-xs text-neutral-500 mt-1 truncate']">
            {{ skill.description }}
          </div>
          <div
            v-if="skill.tags.length > 0"
            :class="['flex gap-1 mt-1.5 flex-wrap']"
          >
            <span
              v-for="tag in skill.tags"
              :key="tag"
              :class="[
                'text-xs px-1.5 py-0.5 rounded',
                'bg-neutral-200 dark:bg-neutral-700',
                'text-neutral-600 dark:text-neutral-400',
              ]"
            >
              {{ tag }}
            </span>
          </div>
        </div>
        <button
          :class="[
            'ml-3 shrink-0',
            'relative w-11 h-6 rounded-full',
            'transition-colors duration-200',
            skill.active
              ? 'bg-green-500'
              : 'bg-neutral-300 dark:bg-neutral-600',
          ]"
          @click="skillsStore.toggleSkill(skill.id)"
        >
          <div
            :class="[
              'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow',
              'transition-transform duration-200',
              skill.active ? 'translate-x-5.5' : 'translate-x-0.5',
            ]"
          />
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
      <div :class="['i-solar:magic-stick-3-bold-duotone', 'text-4xl mb-3 opacity-50']" />
      <div :class="['text-sm']">
        {{ t('settings.pages.skills.empty') }}
      </div>
    </div>
  </div>
</template>
