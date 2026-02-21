<script setup lang="ts">
import { RadioCardSimple } from '@proj-airi/stage-ui/components'
import { useAnalytics } from '@proj-airi/stage-ui/composables'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useVisionStore } from '@proj-airi/stage-ui/stores/modules/vision'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { FieldCheckbox, FieldRange } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, watch } from 'vue'
import { RouterLink } from 'vue-router'

const { trackProviderClick } = useAnalytics()

const visionStore = useVisionStore()
const {
  enabled,
  intervalMs,
  similarityThreshold,
  vlmProvider,
  vlmModel,
  isCapturing,
  lastCaptureTimestamp,
  deduplicationStats,
} = storeToRefs(visionStore)

const providersStore = useProvidersStore()
const { persistedChatProvidersMetadata } = storeToRefs(providersStore)
const consciousnessStore = useConsciousnessStore()

const intervalSeconds = computed({
  get: () => intervalMs.value / 1000,
  set: (val: number) => { intervalMs.value = val * 1000 },
})

const lastCaptureFormatted = computed(() => {
  if (!lastCaptureTimestamp.value)
    return 'Never'
  const diff = Date.now() - lastCaptureTimestamp.value
  if (diff < 60000)
    return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600000)
    return `${Math.floor(diff / 60000)}m ago`
  return `${Math.floor(diff / 3600000)}h ago`
})

// Auto-populate VLM provider from consciousness (chat) provider if not set
watch(enabled, (isEnabled) => {
  if (isEnabled && !vlmProvider.value && consciousnessStore.activeProvider) {
    vlmProvider.value = consciousnessStore.activeProvider
  }
}, { immediate: true })

// Send config update when settings change
watch([enabled, intervalMs, similarityThreshold, vlmProvider, vlmModel], () => {
  visionStore.sendConfigUpdate()
}, { deep: true })
</script>

<template>
  <div flex="~ col md:row gap-6">
    <!-- Left: Settings -->
    <div bg="neutral-100 dark:[rgba(0,0,0,0.3)]" rounded-xl p-4 flex="~ col gap-4" class="h-fit w-full md:w-[45%]">
      <!-- Enable toggle -->
      <FieldCheckbox
        v-model="enabled"
        label="Enable Screenshot Pipeline"
        description="Capture periodic screenshots and analyze them with a Vision Language Model (VLM). Requires a VLM-capable provider."
      />

      <template v-if="enabled">
        <!-- Interval -->
        <FieldRange
          v-model="intervalSeconds"
          label="Capture Interval"
          description="How often to capture a screenshot"
          :min="10"
          :max="300"
          :step="5"
          :format-value="(v: number) => v < 60 ? `${v}s` : `${(v / 60).toFixed(1)}m`"
        />

        <!-- Dedup threshold -->
        <FieldRange
          v-model="similarityThreshold"
          label="Deduplication Threshold"
          description="How different screenshots must be to count as unique (higher = more strict)"
          :min="1"
          :max="10"
          :step="1"
          :format-value="(v: number) => `${v}`"
        />

        <!-- VLM Provider selection -->
        <div flex="~ col gap-4">
          <div>
            <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-500">
              VLM Provider
            </h2>
            <div text="neutral-400 dark:neutral-400">
              <span>Select a provider with vision capabilities for screenshot analysis</span>
            </div>
          </div>
          <div max-w-full>
            <fieldset
              v-if="persistedChatProvidersMetadata.length > 0"
              flex="~ row gap-4"
              :style="{ 'scrollbar-width': 'none' }"
              min-w-0 of-x-scroll scroll-smooth
              role="radiogroup"
            >
              <RadioCardSimple
                v-for="metadata in persistedChatProvidersMetadata"
                :id="`vision-${metadata.id}`"
                :key="metadata.id"
                v-model="vlmProvider"
                name="vlm-provider"
                :value="metadata.id"
                :title="metadata.localizedName || 'Unknown'"
                :description="metadata.localizedDescription"
                @click="trackProviderClick(metadata.id, 'vision')"
              />
              <RouterLink
                to="/settings/providers"
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
                  <span class="font-medium">No Providers Configured</span>
                  <span class="text-sm text-neutral-400 dark:text-neutral-500">Click here to set up a provider with vision capabilities</span>
                </div>
                <div i-solar:arrow-right-line-duotone class="ml-auto text-xl text-neutral-400 dark:text-neutral-500" />
              </RouterLink>
            </div>
          </div>
        </div>

        <!-- VLM Model manual input -->
        <div v-if="vlmProvider" class="border-t border-neutral-200 pt-4 dark:border-neutral-700">
          <label class="mb-1 block text-sm font-medium">
            VLM Model Name
          </label>
          <div text="xs neutral-400 dark:neutral-500" mb-2>
            Enter the vision-capable model name (e.g., gpt-4o, claude-3-5-sonnet, gemini-2.0-flash)
          </div>
          <input
            v-model="vlmModel"
            type="text"
            class="w-full border border-neutral-300 rounded bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
            placeholder="gpt-4o"
          >
        </div>
      </template>
    </div>

    <!-- Right: Status -->
    <div flex="~ col gap-4" class="w-full md:w-[55%]">
      <div w-full rounded-xl bg="neutral-50 dark:[rgba(0,0,0,0.3)]" p-4 flex="~ col gap-4">
        <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-400">
          Pipeline Status
        </h2>

        <!-- Status indicators -->
        <div class="space-y-3">
          <div class="flex items-center gap-3">
            <div
              class="h-3 w-3 rounded-full"
              :class="isCapturing ? 'bg-green-500 shadow-lg shadow-green-500/30' : 'bg-neutral-300 dark:bg-neutral-600'"
            />
            <span class="text-sm font-medium">
              {{ isCapturing ? 'Actively capturing' : 'Idle' }}
            </span>
          </div>

          <div class="flex items-center gap-3">
            <div i-solar:clock-circle-line-duotone class="text-lg text-neutral-400" />
            <span class="text-sm">Last capture: <span class="font-medium">{{ lastCaptureFormatted }}</span></span>
          </div>
        </div>

        <!-- Deduplication stats -->
        <div class="border-t border-neutral-200 pt-4 dark:border-neutral-700">
          <h3 class="mb-3 text-sm text-neutral-500 font-medium dark:text-neutral-400">
            Deduplication Statistics
          </h3>
          <div class="grid grid-cols-3 gap-3">
            <div class="rounded-lg bg-white p-3 text-center dark:bg-neutral-800/50">
              <div class="text-xl font-bold">
                {{ deduplicationStats.total }}
              </div>
              <div class="text-xs text-neutral-500">
                Total
              </div>
            </div>
            <div class="rounded-lg bg-white p-3 text-center dark:bg-neutral-800/50">
              <div class="text-xl text-green-600 font-bold dark:text-green-400">
                {{ deduplicationStats.unique }}
              </div>
              <div class="text-xs text-neutral-500">
                Unique
              </div>
            </div>
            <div class="rounded-lg bg-white p-3 text-center dark:bg-neutral-800/50">
              <div class="text-xl text-amber-600 font-bold dark:text-amber-400">
                {{ deduplicationStats.duplicates }}
              </div>
              <div class="text-xs text-neutral-500">
                Duplicates
              </div>
            </div>
          </div>
        </div>

        <!-- Privacy notice -->
        <div class="border border-amber-200 rounded-lg bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
          <div class="flex items-start gap-2 text-amber-700 dark:text-amber-400">
            <div i-solar:shield-warning-bold-duotone class="mt-0.5 flex-shrink-0 text-lg" />
            <div class="text-xs">
              <span class="font-medium">Privacy Notice:</span> Screenshots are captured locally and sent to your configured VLM provider for analysis. No screenshots are stored permanently. Disable this feature when viewing sensitive content.
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
    <div text="60" i-solar:eye-closed-bold-duotone />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.vision.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
