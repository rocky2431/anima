<script setup lang="ts">
import { Button } from '@anase/ui'
import { inject } from 'vue'
import { useI18n } from 'vue-i18n'

import { OnboardingContextKey } from './utils'

const { t } = useI18n()
const context = inject(OnboardingContextKey)!

const enabledModules = [
  {
    nameKey: 'settings.dialogs.onboarding.features-module-persona',
    descKey: 'settings.dialogs.onboarding.features-module-persona-desc',
    icon: 'i-solar:ghost-bold-duotone',
    enabled: true,
  },
  {
    nameKey: 'settings.dialogs.onboarding.features-module-todo',
    descKey: 'settings.dialogs.onboarding.features-module-todo-desc',
    icon: 'i-solar:checklist-minimalistic-bold-duotone',
    enabled: true,
  },
  {
    nameKey: 'settings.dialogs.onboarding.features-module-memory',
    descKey: 'settings.dialogs.onboarding.features-module-memory-desc',
    icon: 'i-solar:bookmark-bold-duotone',
    enabled: true,
  },
  {
    nameKey: 'settings.dialogs.onboarding.features-module-activity',
    descKey: 'settings.dialogs.onboarding.features-module-activity-desc',
    icon: 'i-solar:chart-2-bold-duotone',
    enabled: true,
  },
  {
    nameKey: 'settings.dialogs.onboarding.features-module-skills',
    descKey: 'settings.dialogs.onboarding.features-module-skills-desc',
    icon: 'i-solar:magic-stick-3-bold-duotone',
    enabled: true,
  },
  {
    nameKey: 'settings.dialogs.onboarding.features-module-screenshot',
    descKey: 'settings.dialogs.onboarding.features-module-screenshot-desc',
    icon: 'i-solar:eye-closed-bold-duotone',
    enabled: false,
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

    <div flex-1 flex="~ col gap-2">
      <div
        v-for="mod in enabledModules"
        :key="mod.nameKey"
        class="flex items-center gap-3 rounded-lg px-3 py-2.5"
        :class="mod.enabled
          ? 'bg-green-50 dark:bg-green-900/10'
          : 'bg-neutral-50 dark:bg-neutral-800/30'"
      >
        <div
          :class="[mod.icon, mod.enabled ? 'text-green-600 dark:text-green-400' : 'text-neutral-400 dark:text-neutral-500']"
          class="flex-shrink-0 text-lg"
        />
        <div class="flex-1">
          <span class="text-sm font-medium">{{ t(mod.nameKey) }}</span>
          <span class="ml-2 text-xs text-neutral-400 dark:text-neutral-500">{{ t(mod.descKey) }}</span>
        </div>
        <div
          v-if="mod.enabled"
          i-solar:check-circle-bold
          class="flex-shrink-0 text-green-500 dark:text-green-400"
        />
        <div
          v-else
          i-solar:close-circle-line-duotone
          class="flex-shrink-0 text-neutral-300 dark:text-neutral-600"
        />
      </div>
    </div>

    <Button
      variant="primary"
      :label="t('settings.dialogs.onboarding.features-ready')"
      @click="context.handleSave"
    />
  </div>
</template>
