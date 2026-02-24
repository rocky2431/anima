import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { useModsServerChannelStore } from '../mods/api/channel-server'
import { useUnifiedProvidersStore } from '../unified-providers'

export const useLlmStore = defineStore('llm-module', () => {
  // Persisted config (localStorage)
  const activeProvider = useLocalStorage('settings/llm/provider', '')
  const activeModel = useLocalStorage('settings/llm/model', '')

  // Runtime state
  const llmConfigured = ref(false)
  const disposers = ref<Array<() => void>>([])

  const configured = computed(() => !!activeProvider.value && !!activeModel.value && llmConfigured.value)

  const sendError = ref<string | null>(null)

  function sendLlmConfig(): void {
    sendError.value = null
    const providerId = activeProvider.value
    const model = activeModel.value
    if (!providerId || !model) {
      sendError.value = `Missing provider (${providerId}) or model (${model})`
      return
    }

    const unifiedStore = useUnifiedProvidersStore()
    const config = unifiedStore.getProviderConfig(providerId)
    if (!config) {
      sendError.value = `Provider config not found for "${providerId}". Make sure you've configured this provider in the Providers page.`
      return
    }

    const apiKey = (config.apiKey ?? config['api-key'] ?? '') as string
    const baseURL = (config.baseUrl ?? config['base-url'] ?? '') as string

    if (!apiKey) {
      sendError.value = `API key not found for "${providerId}". Please set the API key in the Providers page first.`
      return
    }

    const serverChannel = useModsServerChannelStore()
    serverChannel.send({
      type: 'llm:config:update',
      data: {
        provider: providerId,
        apiKey,
        baseURL,
        model,
      },
    })
    sendError.value = null
  }

  function initialize(): void {
    if (disposers.value.length > 0)
      return

    const serverChannel = useModsServerChannelStore()

    disposers.value.push(
      serverChannel.onEvent('llm:config:status', (event) => {
        const { configured: isConfigured, provider, model } = event.data as {
          configured: boolean
          provider?: string
          model?: string
        }
        llmConfigured.value = isConfigured
        if (isConfigured && provider)
          activeProvider.value = provider
        if (isConfigured && model)
          activeModel.value = model
      }),
    )

    // Send LLM config if already configured
    if (activeProvider.value && activeModel.value) {
      sendLlmConfig()
    }
  }

  function dispose(): void {
    for (const d of disposers.value) {
      d()
    }
    disposers.value = []
  }

  function resetState(): void {
    activeProvider.value = ''
    activeModel.value = ''
    llmConfigured.value = false
  }

  return {
    activeProvider,
    activeModel,
    configured,
    llmConfigured,
    sendError,
    sendLlmConfig,
    initialize,
    dispose,
    resetState,
  }
})
