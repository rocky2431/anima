<script setup lang="ts">
import { RadioCardSimple } from '@proj-airi/stage-ui/components'
import { useAnalytics } from '@proj-airi/stage-ui/composables'
import { useEmbeddingStore } from '@proj-airi/stage-ui/stores/modules/embedding'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { storeToRefs } from 'pinia'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

const { t } = useI18n()

const embeddingStore = useEmbeddingStore()
const { activeProvider, activeModel, embeddingConfigured, sendError } = storeToRefs(embeddingStore)

const providersStore = useProvidersStore()
const { configuredEmbeddingProvidersMetadata } = storeToRefs(providersStore)

const { trackProviderClick } = useAnalytics()

// Local model input state, synced from store
const modelInput = ref(activeModel.value || '')
watch(activeModel, (v) => { modelInput.value = v || '' })

const isSaving = ref(false)
const saveResult = ref<'success' | 'error' | null>(null)

function onSave() {
  const model = modelInput.value.trim()
  const provider = activeProvider.value
  if (!model || !provider)
    return

  activeModel.value = model
  isSaving.value = true
  saveResult.value = null

  embeddingStore.sendEmbeddingConfig()

  setTimeout(() => {
    isSaving.value = false
    saveResult.value = embeddingConfigured.value ? 'success' : null
  }, 2000)
}
</script>

<template>
  <div flex="~ col gap-6">
    <div bg="neutral-100 dark:[rgba(0,0,0,0.3)]" rounded-xl p-4 flex="~ col gap-4" class="h-fit w-full">
      <!-- Status indicator -->
      <div class="flex items-center gap-3">
        <div
          class="h-3 w-3 rounded-full"
          :class="embeddingConfigured ? 'bg-green-500 shadow-lg shadow-green-500/30' : 'bg-neutral-300 dark:bg-neutral-600'"
        />
        <span class="text-sm font-medium">
          {{ embeddingConfigured
            ? t('settings.pages.modules.embedding.status.configured')
            : t('settings.pages.modules.embedding.status.not_configured')
          }}
        </span>
      </div>

      <!-- Provider selection -->
      <div flex="~ col gap-4">
        <div>
          <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-500">
            {{ t('settings.pages.modules.embedding.sections.provider.title') }}
          </h2>
          <div text="neutral-400 dark:neutral-400">
            <span>{{ t('settings.pages.modules.embedding.sections.provider.description') }}</span>
          </div>
        </div>
        <div max-w-full>
          <fieldset
            v-if="configuredEmbeddingProvidersMetadata.length > 0"
            flex="~ row gap-4"
            :style="{ 'scrollbar-width': 'none' }"
            min-w-0 of-x-scroll scroll-smooth
            role="radiogroup"
          >
            <RadioCardSimple
              v-for="metadata in configuredEmbeddingProvidersMetadata"
              :id="`embedding-${metadata.id}`"
              :key="metadata.id"
              v-model="activeProvider"
              name="embedding-provider"
              :value="metadata.id"
              :title="metadata.localizedName || 'Unknown'"
              :description="metadata.localizedDescription"
              @click="trackProviderClick(metadata.id, 'embedding')"
            />
            <RouterLink
              to="/settings/providers#embedding"
              border="2px solid"
              class="border-neutral-100 bg-white dark:border-neutral-900 hover:border-primary-500/30 dark:bg-neutral-900/20 dark:hover:border-primary-400/30"
              flex="~ col items-center justify-center"
              transition="all duration-200 ease-in-out"
              relative min-w-50 w-fit rounded-xl p-4
            >
              <div i-solar:add-circle-line-duotone class="text-2xl text-neutral-500 dark:text-neutral-500" />
              <div
                class="bg-dotted-neutral-200/80 dark:bg-dotted-neutral-700/50"
                absolute inset-0 z--1
                style="background-size: 10px 10px; mask-image: linear-gradient(165deg, white 30%, transparent 50%);"
              />
            </RouterLink>
          </fieldset>
          <div v-else>
            <RouterLink
              class="flex items-center gap-3 rounded-lg p-4"
              border="2 dashed neutral-200 dark:neutral-800"
              bg="neutral-50 dark:neutral-800"
              transition="colors duration-200 ease-in-out"
              to="/settings/providers"
            >
              <div i-solar:warning-circle-line-duotone class="text-2xl text-amber-500 dark:text-amber-400" />
              <div class="flex flex-col">
                <span class="font-medium">{{ t('settings.pages.modules.embedding.no_providers_title') }}</span>
                <span class="text-sm text-neutral-400 dark:text-neutral-500">{{ t('settings.pages.modules.embedding.no_providers_description') }}</span>
              </div>
              <div i-solar:arrow-right-line-duotone class="ml-auto text-xl text-neutral-400 dark:text-neutral-500" />
            </RouterLink>
          </div>
        </div>
      </div>

      <!-- Model input -->
      <div v-if="activeProvider" flex="~ col gap-4">
        <div>
          <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-500">
            {{ t('settings.pages.modules.embedding.sections.model.title') }}
          </h2>
          <div text="neutral-400 dark:neutral-400">
            <span>{{ t('settings.pages.modules.embedding.sections.model.description') }}</span>
          </div>
        </div>

        <div flex="~ col gap-3">
          <div flex="~ row gap-3 items-start">
            <input
              v-model="modelInput"
              type="text"
              :placeholder="t('settings.pages.modules.embedding.sections.model.placeholder')"
              class="flex-1 border border-neutral-200 rounded-lg bg-white px-3 py-2.5 text-sm outline-none transition-all duration-200 dark:border-neutral-700 focus:border-primary-400 dark:bg-neutral-800 focus:ring-2 focus:ring-primary-400/20 dark:focus:border-primary-500 dark:focus:ring-primary-500/20"
              @keydown.enter="onSave"
            >
            <button
              type="button"
              :disabled="!modelInput.trim() || isSaving"
              class="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200"
              :class="[
                modelInput.trim() && !isSaving
                  ? 'bg-primary-500 text-white hover:bg-primary-600 active:bg-primary-700 cursor-pointer'
                  : 'bg-neutral-200 text-neutral-400 dark:bg-neutral-700 dark:text-neutral-500 cursor-not-allowed',
              ]"
              @click="onSave"
            >
              <div v-if="isSaving" class="animate-spin">
                <div i-solar:spinner-line-duotone />
              </div>
              <div v-else i-solar:check-circle-line-duotone />
              {{ isSaving
                ? t('settings.pages.modules.embedding.sections.model.saving')
                : t('settings.pages.modules.embedding.sections.model.save')
              }}
            </button>
          </div>

          <div class="text-xs text-neutral-400 dark:text-neutral-500">
            {{ t('settings.pages.modules.embedding.sections.model.hint') }}
          </div>

          <!-- Error message -->
          <div
            v-if="sendError"
            class="flex items-start gap-2 border border-red-200 rounded-lg bg-red-50 p-3 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
          >
            <div i-solar:close-circle-bold-duotone class="mt-0.5 flex-shrink-0 text-lg" />
            <span class="text-sm">{{ sendError }}</span>
          </div>

          <!-- Configured success indicator -->
          <div
            v-if="embeddingConfigured"
            class="flex items-center gap-2 border border-green-200 rounded-lg bg-green-50 p-3 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400"
          >
            <div i-solar:check-circle-bold-duotone class="flex-shrink-0 text-lg" />
            <span class="text-sm font-medium">{{ t('settings.pages.modules.embedding.status.configured') }}</span>
          </div>
        </div>
      </div>

      <!-- Info about embedding usage -->
      <div class="border-t border-neutral-200 pt-4 dark:border-neutral-700">
        <div class="border border-blue-200 rounded-lg bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
          <div class="flex items-start gap-2 text-blue-700 dark:text-blue-400">
            <div i-solar:info-circle-bold-duotone class="mt-0.5 flex-shrink-0 text-lg" />
            <div class="text-xs">
              {{ t('settings.pages.modules.embedding.info') }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div
    v-motion
    text="neutral-200/50 dark:neutral-600/20" pointer-events-none
    fixed top="[calc(100dvh-15rem)]" bottom-0 right--5 z--1
    :initial="{ scale: 0.9, opacity: 0, x: 20 }"
    :enter="{ scale: 1, opacity: 1, x: 0 }"
    :duration="500"
    size-60
    flex items-center justify-center
  >
    <div text="60" i-solar:graph-new-bold-duotone />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.embedding.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
