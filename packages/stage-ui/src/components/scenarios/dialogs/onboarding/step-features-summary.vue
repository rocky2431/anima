<script setup lang="ts">
import { Button } from '@anase/ui'
import { inject } from 'vue'
import { useI18n } from 'vue-i18n'

import { OnboardingContextKey } from './utils'

const { t } = useI18n()
const context = inject(OnboardingContextKey)!

const readyModules = [
  {
    nameKey: 'settings.dialogs.onboarding.features-module-chat',
    descKey: 'settings.dialogs.onboarding.features-module-chat-desc',
    icon: 'i-solar:chat-round-dots-bold-duotone',
  },
  {
    nameKey: 'settings.dialogs.onboarding.features-module-persona',
    descKey: 'settings.dialogs.onboarding.features-module-persona-desc',
    icon: 'i-solar:ghost-bold-duotone',
  },
  {
    nameKey: 'settings.dialogs.onboarding.features-module-todo',
    descKey: 'settings.dialogs.onboarding.features-module-todo-desc',
    icon: 'i-solar:checklist-minimalistic-bold-duotone',
  },
  {
    nameKey: 'settings.dialogs.onboarding.features-module-skills',
    descKey: 'settings.dialogs.onboarding.features-module-skills-desc',
    icon: 'i-solar:magic-stick-3-bold-duotone',
  },
  {
    nameKey: 'settings.dialogs.onboarding.features-module-memory',
    descKey: 'settings.dialogs.onboarding.features-module-memory-desc',
    icon: 'i-solar:bookmark-bold-duotone',
  },
] as const

const recommendedModules = [
  {
    nameKey: 'settings.dialogs.onboarding.features-module-embedding',
    descKey: 'settings.dialogs.onboarding.features-module-embedding-desc',
    icon: 'i-solar:graph-new-bold-duotone',
  },
  {
    nameKey: 'settings.dialogs.onboarding.features-module-tts',
    descKey: 'settings.dialogs.onboarding.features-module-tts-desc',
    icon: 'i-solar:microphone-3-bold-duotone',
  },
  {
    nameKey: 'settings.dialogs.onboarding.features-module-activity',
    descKey: 'settings.dialogs.onboarding.features-module-activity-desc',
    icon: 'i-solar:chart-2-bold-duotone',
  },
] as const

const experimentalModules = [
  {
    nameKey: 'settings.dialogs.onboarding.features-module-screenshot',
    descKey: 'settings.dialogs.onboarding.features-module-screenshot-desc',
    icon: 'i-solar:eye-closed-bold-duotone',
  },
] as const
</script>

<template>
  <div h-full flex flex-col gap-4>
    <div sticky top-0 z-100 flex flex-shrink-0 items-center gap-2>
      <button outline-none @click="context.handlePreviousStep">
        <div i-solar:alt-arrow-left-line-duotone h-5 w-5 />
      </button>
      <h2 class="flex-1 text-center text-xl text-neutral-800 font-semibold md:text-left md:text-2xl dark:text-neutral-100">
        {{ t('settings.dialogs.onboarding.features-summary') }}
      </h2>
      <div h-5 w-5 />
    </div>

    <p class="text-sm text-neutral-600 dark:text-neutral-400">
      {{ t('settings.dialogs.onboarding.features-summary-description') }}
    </p>

    <div class="flex-1 overflow-y-auto space-y-4">
      <!-- Ready Now -->
      <div>
        <div class="mb-2 flex items-center gap-1.5 text-sm text-green-600 font-medium dark:text-green-400">
          <div i-solar:check-circle-bold class="text-base" />
          {{ t('settings.dialogs.onboarding.features-tier-ready') }}
        </div>
        <div class="space-y-1.5">
          <div
            v-for="mod in readyModules"
            :key="mod.nameKey"
            class="flex items-center gap-3 rounded-lg bg-green-50 px-3 py-2 dark:bg-green-900/10"
          >
            <div :class="mod.icon" class="flex-shrink-0 text-lg text-green-600 dark:text-green-400" />
            <div class="flex-1">
              <span class="text-sm font-medium">{{ t(mod.nameKey) }}</span>
              <span class="ml-2 text-xs text-neutral-400 dark:text-neutral-500">{{ t(mod.descKey) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Recommended Next -->
      <div>
        <div class="mb-2 flex items-center gap-1.5 text-sm text-blue-600 font-medium dark:text-blue-400">
          <div i-solar:clipboard-list-bold-duotone class="text-base" />
          {{ t('settings.dialogs.onboarding.features-tier-recommended') }}
        </div>
        <div class="space-y-1.5">
          <div
            v-for="mod in recommendedModules"
            :key="mod.nameKey"
            class="flex items-center gap-3 rounded-lg bg-blue-50 px-3 py-2 dark:bg-blue-900/10"
          >
            <div :class="mod.icon" class="flex-shrink-0 text-lg text-blue-500 dark:text-blue-400" />
            <div class="flex-1">
              <span class="text-sm font-medium">{{ t(mod.nameKey) }}</span>
              <span class="ml-2 text-xs text-neutral-400 dark:text-neutral-500">{{ t(mod.descKey) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Experimental -->
      <div>
        <div class="mb-2 flex items-center gap-1.5 text-sm text-amber-600 font-medium dark:text-amber-400">
          <div i-solar:test-tube-bold-duotone class="text-base" />
          {{ t('settings.dialogs.onboarding.features-tier-experimental') }}
        </div>
        <div class="space-y-1.5">
          <div
            v-for="mod in experimentalModules"
            :key="mod.nameKey"
            class="flex items-center gap-3 rounded-lg bg-amber-50 px-3 py-2 dark:bg-amber-900/10"
          >
            <div :class="mod.icon" class="flex-shrink-0 text-lg text-amber-500 dark:text-amber-400" />
            <div class="flex-1">
              <span class="text-sm font-medium">{{ t(mod.nameKey) }}</span>
              <span class="ml-2 text-xs text-neutral-400 dark:text-neutral-500">{{ t(mod.descKey) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <Button
      variant="primary"
      :label="t('settings.dialogs.onboarding.features-ready')"
      @click="context.handleSave"
    />
  </div>
</template>
