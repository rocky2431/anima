<script setup lang="ts">
import { IconStatusItem, RippleGrid } from '@proj-airi/stage-ui/components'
import { useAnalytics, useScrollToHash } from '@proj-airi/stage-ui/composables'
import { useRippleGridState } from '@proj-airi/stage-ui/composables/use-ripple-grid-state'
import { useUnifiedProvidersStore } from '@proj-airi/stage-ui/stores/unified-providers'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

const route = useRoute()
const { t } = useI18n()
const unifiedStore = useUnifiedProvidersStore()
const { lastClickedIndex, setLastClickedIndex } = useRippleGridState()
const { trackProviderClick } = useAnalytics()

const {
  primaryProviders,
  enhancementProviders,
  localProviders,
  compatibleProviders,
} = storeToRefs(unifiedStore)

/**
 * Transitional route map: unified provider ID → old detail page path.
 * Will be replaced by new unified detail pages in Phase 7.
 */
const DETAIL_ROUTE_MAP: Record<string, string> = {
  'openrouter': '/settings/providers/chat/openrouter-ai',
  'openai-compatible': '/settings/providers/chat/openai-compatible',
  'ollama': '/settings/providers/chat/ollama',
  'lm-studio': '/settings/providers/chat/lm-studio',
  'elevenlabs': '/settings/providers/speech/elevenlabs',
  'kokoro-local': '/settings/providers/speech/kokoro-local',
  'microsoft-speech': '/settings/providers/speech/microsoft-speech',
  'deepgram': '/settings/providers/speech/deepgram-tts',
  'aliyun': '/settings/providers/speech/alibaba-cloud-model-studio',
  'volcengine': '/settings/providers/speech/volcengine',
  'web-speech-api': '/settings/providers/transcription/browser-web-speech-api',
  'local-pipeline': '/settings/providers/chat/local-pipeline',
}

function getDetailRoute(id: string): string {
  return DETAIL_ROUTE_MAP[id] || `/settings/providers/chat/${id}`
}

const tierBlocks = computed(() => {
  let globalIndex = 0

  const blocks = [
    {
      id: 'primary',
      icon: 'i-solar:star-bold-duotone',
      title: t('settings.pages.providers.tier.primary.title', 'Recommended'),
      description: t('settings.pages.providers.tier.primary.description', 'Multi-capability providers for chat, vision, audio, and more'),
      providers: primaryProviders.value,
    },
    {
      id: 'enhancement',
      icon: 'i-solar:magic-stick-3-bold-duotone',
      title: t('settings.pages.providers.tier.enhancement.title', 'Enhancement'),
      description: t('settings.pages.providers.tier.enhancement.description', 'Specialized providers for high-quality TTS, STT, and more'),
      providers: enhancementProviders.value,
    },
    {
      id: 'local',
      icon: 'i-solar:laptop-minimalistic-bold-duotone',
      title: t('settings.pages.providers.tier.local.title', 'Local / Self-hosted'),
      description: t('settings.pages.providers.tier.local.description', 'Run models locally for privacy and offline use'),
      providers: localProviders.value,
    },
    {
      id: 'compatible',
      icon: 'i-solar:plug-circle-bold-duotone',
      title: t('settings.pages.providers.tier.compatible.title', 'Custom / Compatible'),
      description: t('settings.pages.providers.tier.compatible.description', 'Connect any OpenAI-compatible API endpoint'),
      providers: compatibleProviders.value,
    },
  ]

  return blocks
    .filter(block => block.providers.length > 0)
    .map(block => ({
      ...block,
      providers: block.providers.map(provider => ({
        ...provider,
        renderIndex: globalIndex++,
        detailRoute: getDetailRoute(provider.id),
      })),
    }))
})

useScrollToHash(() => route.hash, {
  auto: true,
  offset: 16,
  behavior: 'smooth',
  maxRetries: 15,
  retryDelay: 150,
})
</script>

<template>
  <div mb-6 flex flex-col gap-5>
    <div bg="primary-500/10 dark:primary-800/25" rounded-lg p-4>
      <div mb-2 text-xl font-normal text="primary-800 dark:primary-100">
        {{ $t('settings.pages.providers.helpinfo.title') }}
      </div>
      <div text="primary-700 dark:primary-300">
        <i18n-t keypath="settings.pages.providers.helpinfo.description">
          <template #chat>
            <div bg="primary-500/10 dark:primary-800/25" inline-flex items-center gap-1 rounded-lg px-2 py-0.5 translate-y="[0.25lh]">
              <div i-solar:chat-square-like-bold-duotone />
              <strong class="font-normal">Chat</strong>
            </div>
          </template>
        </i18n-t>
      </div>
    </div>

    <RippleGrid
      :sections="tierBlocks"
      :get-items="block => block.providers"
      :columns="{ default: 1, sm: 2, xl: 3 }"
      :origin-index="lastClickedIndex"
      @item-click="({ globalIndex }) => setLastClickedIndex(globalIndex)"
    >
      <template #header="{ section: block }">
        <div flex="~ row items-center gap-2">
          <div :id="block.id" :class="block.icon" text="neutral-500 dark:neutral-400 4xl" />
          <div>
            <div>
              <span text="neutral-300 dark:neutral-500 sm sm:base">{{ block.description }}</span>
            </div>
            <div flex text-nowrap text="2xl sm:3xl" font-normal>
              <div>
                {{ block.title }}
              </div>
            </div>
          </div>
        </div>
      </template>

      <template #item="{ item: provider }">
        <IconStatusItem
          :title="provider.localizedName || 'Unknown'"
          :description="provider.localizedDescription"
          :icon="provider.icon"
          :icon-color="provider.iconColor"
          :icon-image="provider.iconImage"
          :to="provider.detailRoute"
          :configured="provider.configured"
          @click="trackProviderClick(provider.id, provider.tier)"
        />
      </template>
    </RippleGrid>
  </div>
  <div
    v-motion
    text="neutral-500/5 dark:neutral-600/20" pointer-events-none
    fixed top="[calc(100dvh-15rem)]" bottom-0 right--5 z--1
    :initial="{ scale: 0.9, opacity: 0, y: 20 }"
    :enter="{ scale: 1, opacity: 1, y: 0 }"
    :duration="500"
    size-60
    flex items-center justify-center
  >
    <div text="60" i-solar:box-minimalistic-bold-duotone />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.providers.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.providers.description
  icon: i-solar:box-minimalistic-bold-duotone
  settingsEntry: true
  order: 6
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
