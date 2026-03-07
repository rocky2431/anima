import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, nextTick, ref } from 'vue'

import { useActivityModuleStore } from './modules/activity'
import { useContextDisplayStore } from './modules/context-display'
import { useEmbeddingStore } from './modules/embedding'
import { useLlmStore } from './modules/llm'
import { useMemoryModuleStore } from './modules/memory'
import { usePersonaModuleStore } from './modules/persona'
import { useSkillsModuleStore } from './modules/skills'
import { useTodoModuleStore } from './modules/todo'
import { useUnifiedProvidersStore } from './unified-providers'

export const useOnboardingStore = defineStore('onboarding', () => {
  const unifiedStore = useUnifiedProvidersStore()

  // Track if first-time setup has been completed or skipped
  const hasCompletedSetup = useLocalStorage('onboarding/completed', false)
  const hasSkippedSetup = useLocalStorage('onboarding/skipped', false)

  // Character template selected during onboarding (defaults to 'aria')
  const selectedCharacterTemplate = useLocalStorage('onboarding/character-template', 'aria')

  // Track if we should show the setup dialog
  const shouldShowSetup = ref(false)

  // Check if any essential provider is configured (unified IDs)
  const hasEssentialProviderConfigured = computed(() => {
    const essentialProviders = ['openrouter', 'dashscope', 'ollama', 'lm-studio', 'openai-compatible']
    return essentialProviders.some(providerId => unifiedStore.configuredProviders[providerId])
  })

  // Check if first-time setup should be shown
  const needsOnboarding = computed(() => {
    // Don't show if already completed or skipped
    if (hasCompletedSetup.value || hasSkippedSetup.value) {
      console.warn('Onboarding already completed or skipped')
      return false
    }

    // Don't show if user already has essential providers configured
    if (hasEssentialProviderConfigured.value) {
      console.warn('Essential provider already configured, no onboarding needed')
      return false
    }

    return true
  })

  // Initialize setup check
  async function initializeSetupCheck() {
    if (needsOnboarding.value) {
      // Use nextTick to ensure the app is fully rendered before showing dialog
      await nextTick()
      shouldShowSetup.value = true
    }
  }

  /**
   * Auto-enable core modules after onboarding completes.
   * These modules are zero-cost (pure listeners/display) and form the
   * baseline "proactive AI assistant" experience.
   */
  function autoEnableModules(): void {
    const enabledModules: string[] = []

    try {
      useTodoModuleStore().initialize()
      enabledModules.push('todo')
    }
    catch (err) {
      console.error('Failed to initialize todo module:', err)
    }

    try {
      useMemoryModuleStore().initialize()
      enabledModules.push('memory')
    }
    catch (err) {
      console.error('Failed to initialize memory module:', err)
    }

    try {
      useActivityModuleStore().initialize()
      enabledModules.push('activity')
    }
    catch (err) {
      console.error('Failed to initialize activity module:', err)
    }

    try {
      useSkillsModuleStore().initialize()
      enabledModules.push('skills')
    }
    catch (err) {
      console.error('Failed to initialize skills module:', err)
    }

    try {
      usePersonaModuleStore().initialize()
      enabledModules.push('persona')
    }
    catch (err) {
      console.error('Failed to initialize persona module:', err)
    }

    try {
      useContextDisplayStore().initialize()
      enabledModules.push('contextDisplay')
    }
    catch (err) {
      console.error('Failed to initialize context-display module:', err)
    }

    try {
      useEmbeddingStore().initialize()
      enabledModules.push('embedding')
    }
    catch (err) {
      console.error('Failed to initialize embedding module:', err)
    }

    try {
      useLlmStore().initialize()
      enabledModules.push('llm')
    }
    catch (err) {
      console.error('Failed to initialize llm module:', err)
    }

    console.info('[Onboarding] Auto-enabled modules:', enabledModules.join(', '))
  }

  // Mark setup as completed
  function markSetupCompleted() {
    hasCompletedSetup.value = true
    hasSkippedSetup.value = false
    shouldShowSetup.value = false
  }

  // Mark setup as skipped
  function markSetupSkipped() {
    hasSkippedSetup.value = true
    shouldShowSetup.value = false
  }

  // Reset setup state (for testing or re-showing setup)
  function resetSetupState() {
    hasCompletedSetup.value = false
    hasSkippedSetup.value = false
    shouldShowSetup.value = false
  }

  // Force show setup dialog
  function forceShowSetup() {
    shouldShowSetup.value = true
  }

  return {
    hasCompletedSetup,
    hasSkippedSetup,
    shouldShowSetup,
    hasEssentialProviderConfigured,
    needsOnboarding,
    selectedCharacterTemplate,

    initializeSetupCheck,
    markSetupCompleted,
    markSetupSkipped,
    resetSetupState,
    forceShowSetup,
    autoEnableModules,
  }
})
