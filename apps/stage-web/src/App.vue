<script setup lang="ts">
import { OnboardingDialog, ToasterRoot } from '@proj-airi/stage-ui/components'
import { useSharedAnalyticsStore } from '@proj-airi/stage-ui/stores/analytics'
import { useCharacterOrchestratorStore } from '@proj-airi/stage-ui/stores/character'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useDisplayModelsStore } from '@proj-airi/stage-ui/stores/display-models'
import { useModsServerChannelStore } from '@proj-airi/stage-ui/stores/mods/api/channel-server'
import { useContextBridgeStore } from '@proj-airi/stage-ui/stores/mods/api/context-bridge'
import { useActivityModuleStore } from '@proj-airi/stage-ui/stores/modules/activity'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useContextDisplayStore } from '@proj-airi/stage-ui/stores/modules/context-display'
import { useDesktopShellStore } from '@proj-airi/stage-ui/stores/modules/desktop-shell'
import { useEmbeddingStore } from '@proj-airi/stage-ui/stores/modules/embedding'
import { useLlmStore } from '@proj-airi/stage-ui/stores/modules/llm'
import { useMemoryModuleStore } from '@proj-airi/stage-ui/stores/modules/memory'
import { usePersonaModuleStore } from '@proj-airi/stage-ui/stores/modules/persona'
import { useProviderSyncStore } from '@proj-airi/stage-ui/stores/modules/provider-sync'
import { useSkillsModuleStore } from '@proj-airi/stage-ui/stores/modules/skills'
import { useTodoModuleStore } from '@proj-airi/stage-ui/stores/modules/todo'
import { useOnboardingStore } from '@proj-airi/stage-ui/stores/onboarding'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { useTheme } from '@proj-airi/ui'
import { StageTransitionGroup } from '@proj-airi/ui-transitions'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView } from 'vue-router'
import { toast, Toaster } from 'vue-sonner'

import PerformanceOverlay from './components/Devtools/PerformanceOverlay.vue'

import { usePWAStore } from './stores/pwa'

usePWAStore()

const contextBridgeStore = useContextBridgeStore()
const i18n = useI18n()
const displayModelsStore = useDisplayModelsStore()
const settingsStore = useSettings()
const settings = storeToRefs(settingsStore)
const onboardingStore = useOnboardingStore()
const chatSessionStore = useChatSessionStore()
const serverChannelStore = useModsServerChannelStore()
const characterOrchestratorStore = useCharacterOrchestratorStore()
const { shouldShowSetup } = storeToRefs(onboardingStore)
const { isDark } = useTheme()
const cardStore = useAiriCardStore()
const analyticsStore = useSharedAnalyticsStore()
const todoStore = useTodoModuleStore()
const memoryStore = useMemoryModuleStore()
const activityStore = useActivityModuleStore()
const skillsStore = useSkillsModuleStore()
const personaStore = usePersonaModuleStore()
const contextDisplayStore = useContextDisplayStore()
const desktopShellStore = useDesktopShellStore()
const embeddingStore = useEmbeddingStore()
const llmStore = useLlmStore()
const providerSyncStore = useProviderSyncStore()

const primaryColor = computed(() => {
  return isDark.value
    ? `color-mix(in srgb, oklch(95% var(--chromatic-chroma-900) calc(var(--chromatic-hue) + ${0})) 70%, oklch(50% 0 360))`
    : `color-mix(in srgb, oklch(95% var(--chromatic-chroma-900) calc(var(--chromatic-hue) + ${0})) 90%, oklch(90% 0 360))`
})

const secondaryColor = computed(() => {
  return isDark.value
    ? `color-mix(in srgb, oklch(95% var(--chromatic-chroma-900) calc(var(--chromatic-hue) + ${180})) 70%, oklch(50% 0 360))`
    : `color-mix(in srgb, oklch(95% var(--chromatic-chroma-900) calc(var(--chromatic-hue) + ${180})) 90%, oklch(90% 0 360))`
})

const tertiaryColor = computed(() => {
  return isDark.value
    ? `color-mix(in srgb, oklch(95% var(--chromatic-chroma-900) calc(var(--chromatic-hue) + ${60})) 70%, oklch(50% 0 360))`
    : `color-mix(in srgb, oklch(95% var(--chromatic-chroma-900) calc(var(--chromatic-hue) + ${60})) 90%, oklch(90% 0 360))`
})

const colors = computed(() => {
  return [primaryColor.value, secondaryColor.value, tertiaryColor.value, isDark.value ? '#121212' : '#FFFFFF']
})

watch(settings.language, () => {
  i18n.locale.value = settings.language.value
})

watch(settings.themeColorsHue, () => {
  document.documentElement.style.setProperty('--chromatic-hue', settings.themeColorsHue.value.toString())
}, { immediate: true })

watch(settings.themeColorsHueDynamic, () => {
  document.documentElement.classList.toggle('dynamic-hue', settings.themeColorsHueDynamic.value)
}, { immediate: true })

// Initialize first-time setup check when app mounts
onMounted(async () => {
  analyticsStore.initialize()
  cardStore.initialize()

  onboardingStore.initializeSetupCheck()

  await chatSessionStore.initialize()
  await serverChannelStore.initialize({ possibleEvents: ['ui:configure'] }).catch(err => console.error('Failed to initialize Mods Server Channel in App.vue:', err))
  await contextBridgeStore.initialize()
  characterOrchestratorStore.initialize()

  // Initialize brain-connected module stores (after WS is connected)
  providerSyncStore.initialize()
  todoStore.initialize()
  memoryStore.initialize()
  activityStore.initialize()
  skillsStore.initialize()
  personaStore.initialize()
  contextDisplayStore.initialize()
  desktopShellStore.initialize()
  embeddingStore.initialize()
  llmStore.initialize()

  await displayModelsStore.loadDisplayModelsFromIndexedDB()
  await settingsStore.initializeStageModel()
})

onUnmounted(() => {
  contextBridgeStore.dispose()
  todoStore.dispose()
  memoryStore.dispose()
  activityStore.dispose()
  skillsStore.dispose()
  personaStore.dispose()
  contextDisplayStore.dispose()
  desktopShellStore.dispose()
  embeddingStore.dispose()
  llmStore.dispose()
  providerSyncStore.dispose()
})

// Handle first-time setup events
function handleSetupConfigured() {
  onboardingStore.markSetupCompleted()
  onboardingStore.autoEnableModules()
}

function handleSetupSkipped() {
  onboardingStore.markSetupSkipped()
}
</script>

<template>
  <StageTransitionGroup
    :primary-color="primaryColor"
    :secondary-color="secondaryColor"
    :tertiary-color="tertiaryColor"
    :colors="colors"
    :z-index="100"
    :disable-transitions="settings.disableTransitions.value"
    :use-page-specific-transitions="settings.usePageSpecificTransitions.value"
  >
    <RouterView v-slot="{ Component }">
      <KeepAlive :include="['IndexScenePage', 'StageScenePage']">
        <component :is="Component" />
      </KeepAlive>
    </RouterView>
  </StageTransitionGroup>

  <ToasterRoot @close="id => toast.dismiss(id)">
    <Toaster />
  </ToasterRoot>

  <!-- First Time Setup Dialog -->
  <OnboardingDialog
    v-model="shouldShowSetup"
    @configured="handleSetupConfigured"
    @skipped="handleSetupSkipped"
  />

  <PerformanceOverlay />
</template>

<style>
/* We need this to properly animate the CSS variable */
@property --chromatic-hue {
  syntax: '<number>';
  initial-value: 0;
  inherits: true;
}

@keyframes hue-anim {
  from {
    --chromatic-hue: 0;
  }
  to {
    --chromatic-hue: 360;
  }
}

.dynamic-hue {
  animation: hue-anim 10s linear infinite;
}
</style>
