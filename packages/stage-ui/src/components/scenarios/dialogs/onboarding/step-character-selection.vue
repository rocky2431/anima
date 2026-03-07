<script setup lang="ts">
import { Button } from '@anase/ui'
import { storeToRefs } from 'pinia'
import { inject } from 'vue'
import { useI18n } from 'vue-i18n'

import { CHARACTER_TEMPLATES } from '../../../../stores/modules/anase-card'
import { useOnboardingStore } from '../../../../stores/onboarding'
import { OnboardingContextKey } from './utils'

const { t } = useI18n()
const context = inject(OnboardingContextKey)!
const onboardingStore = useOnboardingStore()
const { selectedCharacterTemplate } = storeToRefs(onboardingStore)

const characters = CHARACTER_TEMPLATES.map(tpl => ({
  id: tpl.id,
  name: tpl.name,
  icon: tpl.icon,
  descKey: `settings.dialogs.onboarding.character-${tpl.id}-desc`,
}))
</script>

<template>
  <div h-full flex flex-col gap-4>
    <div sticky top-0 z-100 flex flex-shrink-0 items-center gap-2>
      <button outline-none @click="context.handlePreviousStep">
        <div i-solar:alt-arrow-left-line-duotone h-5 w-5 />
      </button>
      <h2 class="flex-1 text-center text-xl text-neutral-800 font-semibold md:text-left md:text-2xl dark:text-neutral-100">
        {{ t('settings.dialogs.onboarding.select-character') }}
      </h2>
      <div h-5 w-5 />
    </div>

    <p class="text-sm text-neutral-600 dark:text-neutral-400">
      {{ t('settings.dialogs.onboarding.select-character-description') }}
    </p>

    <div flex-1 flex="~ col gap-3">
      <button
        v-for="char in characters"
        :key="char.id"
        type="button"
        class="flex items-start gap-4 rounded-xl p-4 text-left transition-all duration-200"
        :class="[
          selectedCharacterTemplate === char.id
            ? 'bg-primary-50 border-2 border-primary-500 dark:bg-primary-900/20 dark:border-primary-400'
            : 'bg-neutral-50 border-2 border-neutral-200 hover:border-primary-300 dark:bg-neutral-800/50 dark:border-neutral-700 dark:hover:border-primary-600',
        ]"
        @click="selectedCharacterTemplate = char.id"
      >
        <div
          class="mt-0.5 flex-shrink-0 text-2xl"
          :class="[
            char.icon,
            selectedCharacterTemplate === char.id
              ? 'text-primary-500 dark:text-primary-400'
              : 'text-neutral-400 dark:text-neutral-500',
          ]"
        />
        <div flex="~ col gap-1">
          <span class="text-base font-semibold" :class="selectedCharacterTemplate === char.id ? 'text-primary-700 dark:text-primary-300' : ''">
            {{ char.name }}
          </span>
          <span class="text-sm text-neutral-500 dark:text-neutral-400">
            {{ t(char.descKey) }}
          </span>
        </div>
        <div
          v-if="selectedCharacterTemplate === char.id"
          class="ml-auto mt-1 flex-shrink-0"
        >
          <div i-solar:check-circle-bold class="text-xl text-primary-500 dark:text-primary-400" />
        </div>
      </button>
    </div>

    <Button
      variant="primary"
      :label="t('settings.dialogs.onboarding.next')"
      @click="context.handleNextStep()"
    />
  </div>
</template>
