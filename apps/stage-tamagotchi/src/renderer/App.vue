<script setup lang="ts">
import { defineInvokeHandler } from '@moeru/eventa'
import { themeColorFromValue, useThemeColor } from '@anase/stage-layouts/composables/theme-color'
import { ToasterRoot } from '@anase/stage-ui/components'
import { useSharedAnalyticsStore } from '@anase/stage-ui/stores/analytics'
import { useCharacterOrchestratorStore } from '@anase/stage-ui/stores/character'
import { useChatSessionStore } from '@anase/stage-ui/stores/chat/session-store'
import { usePluginHostInspectorStore } from '@anase/stage-ui/stores/devtools/plugin-host-debug'
import { useDisplayModelsStore } from '@anase/stage-ui/stores/display-models'
import { useModsServerChannelStore } from '@anase/stage-ui/stores/mods/api/channel-server'
import { useContextBridgeStore } from '@anase/stage-ui/stores/mods/api/context-bridge'
import { useActivityModuleStore } from '@anase/stage-ui/stores/modules/activity'
import { useAiriCardStore } from '@anase/stage-ui/stores/modules/anase-card'
import { useContextDisplayStore } from '@anase/stage-ui/stores/modules/context-display'
import { useMemoryModuleStore } from '@anase/stage-ui/stores/modules/memory'
import { usePersonaModuleStore } from '@anase/stage-ui/stores/modules/persona'
import { useSkillsModuleStore } from '@anase/stage-ui/stores/modules/skills'
import { useTodoModuleStore } from '@anase/stage-ui/stores/modules/todo'
import { useOnboardingStore } from '@anase/stage-ui/stores/onboarding'
import { usePerfTracerBridgeStore } from '@anase/stage-ui/stores/perf-tracer-bridge'
import { listProvidersForPluginHost, shouldPublishPluginHostCapabilities } from '@anase/stage-ui/stores/plugin-host-capabilities'
import { useSettings } from '@anase/stage-ui/stores/settings'
import { useTheme } from '@anase/ui'
import { storeToRefs } from 'pinia'
import { onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { toast, Toaster } from 'vue-sonner'

import ResizeHandler from './components/ResizeHandler.vue'

import {
  electronOpenSettings,
  electronPluginInspect,
  electronPluginList,
  electronPluginLoad,
  electronPluginLoadEnabled,
  electronPluginSetEnabled,
  electronPluginUnload,
  electronPluginUpdateCapability,
  electronStartTrackMousePosition,
  electronStartWebSocketServer,
  pluginProtocolListProviders,
  pluginProtocolListProvidersEventName,
} from '../shared/eventa'
import { useElectronEventaContext, useElectronEventaInvoke } from './composables/electron-vueuse'

const { isDark: dark } = useTheme()
const i18n = useI18n()
const contextBridgeStore = useContextBridgeStore()
const displayModelsStore = useDisplayModelsStore()
const settingsStore = useSettings()
const { language, themeColorsHue, themeColorsHueDynamic } = storeToRefs(settingsStore)
const onboardingStore = useOnboardingStore()
const router = useRouter()
const route = useRoute()
const cardStore = useAiriCardStore()
const chatSessionStore = useChatSessionStore()
const serverChannelStore = useModsServerChannelStore()
const characterOrchestratorStore = useCharacterOrchestratorStore()
const analyticsStore = useSharedAnalyticsStore()
const pluginHostInspectorStore = usePluginHostInspectorStore()
usePerfTracerBridgeStore()
const todoStore = useTodoModuleStore()
const memoryStore = useMemoryModuleStore()
const activityStore = useActivityModuleStore()
const skillsStore = useSkillsModuleStore()
const personaStore = usePersonaModuleStore()
const contextDisplayStore = useContextDisplayStore()

watch(language, () => {
  i18n.locale.value = language.value
})

const { updateThemeColor } = useThemeColor(themeColorFromValue({ light: 'rgb(255 255 255)', dark: 'rgb(18 18 18)' }))
watch(dark, () => updateThemeColor(), { immediate: true })
watch(route, () => updateThemeColor(), { immediate: true })
onMounted(() => updateThemeColor())

const startWebSocketServer = useElectronEventaInvoke(electronStartWebSocketServer)

onMounted(async () => {
  const context = useElectronEventaContext()
  const listPlugins = useElectronEventaInvoke(electronPluginList)
  const setPluginEnabled = useElectronEventaInvoke(electronPluginSetEnabled)
  const loadEnabledPlugins = useElectronEventaInvoke(electronPluginLoadEnabled)
  const loadPlugin = useElectronEventaInvoke(electronPluginLoad)
  const unloadPlugin = useElectronEventaInvoke(electronPluginUnload)
  const inspectPluginHost = useElectronEventaInvoke(electronPluginInspect)

  // NOTICE: register plugin host bridge before long async startup work so devtools pages can use it immediately.
  pluginHostInspectorStore.setBridge({
    list: () => listPlugins(),
    setEnabled: payload => setPluginEnabled(payload),
    loadEnabled: () => loadEnabledPlugins(),
    load: payload => loadPlugin(payload),
    unload: payload => unloadPlugin(payload),
    inspect: () => inspectPluginHost(),
  })

  analyticsStore.initialize()
  cardStore.initialize()
  onboardingStore.initializeSetupCheck()

  await chatSessionStore.initialize()
  await displayModelsStore.loadDisplayModelsFromIndexedDB()
  await settingsStore.initializeStageModel()
  await startWebSocketServer({ websocketSecureEnabled: settingsStore.websocketSecureEnabled })

  await serverChannelStore.initialize({ possibleEvents: ['ui:configure'] }).catch(err => console.error('Failed to initialize Mods Server Channel in App.vue:', err))
  await contextBridgeStore.initialize()
  characterOrchestratorStore.initialize()

  // Initialize brain-connected module stores (after WS is connected)
  todoStore.initialize()
  memoryStore.initialize()
  activityStore.initialize()
  skillsStore.initialize()
  personaStore.initialize()
  contextDisplayStore.initialize()

  const startTrackingCursorPoint = useElectronEventaInvoke(electronStartTrackMousePosition)
  const reportPluginCapability = useElectronEventaInvoke(electronPluginUpdateCapability)
  await startTrackingCursorPoint()

  // Expose stage provider definitions to plugin host APIs.
  defineInvokeHandler(context.value, pluginProtocolListProviders, async () => listProvidersForPluginHost())

  if (shouldPublishPluginHostCapabilities()) {
    await reportPluginCapability({
      key: pluginProtocolListProvidersEventName,
      state: 'ready',
      metadata: {
        source: 'stage-ui',
      },
    })
  }

  // Listen for open-settings IPC message from main process
  defineInvokeHandler(context.value, electronOpenSettings, () => router.push('/settings'))
})

watch(themeColorsHue, () => {
  document.documentElement.style.setProperty('--chromatic-hue', themeColorsHue.value.toString())
}, { immediate: true })

watch(themeColorsHueDynamic, () => {
  document.documentElement.classList.toggle('dynamic-hue', themeColorsHueDynamic.value)
}, { immediate: true })

onUnmounted(() => {
  contextBridgeStore.dispose()
  todoStore.dispose()
  memoryStore.dispose()
  activityStore.dispose()
  skillsStore.dispose()
  personaStore.dispose()
  contextDisplayStore.dispose()
})
</script>

<template>
  <ToasterRoot @close="id => toast.dismiss(id)">
    <Toaster />
  </ToasterRoot>
  <ResizeHandler />
  <RouterView />
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
