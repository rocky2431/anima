import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

import { useModsServerChannelStore } from '../mods/api/channel-server'
import { useUnifiedProvidersStore } from '../unified-providers'

export const useProviderSyncStore = defineStore('provider-sync-module', () => {
  const disposers = ref<Array<() => void>>([])
  const restored = ref(false)
  let syncPaused = false

  function pushConfigsToBackend(): void {
    if (syncPaused)
      return

    const unifiedStore = useUnifiedProvidersStore()
    const configs = unifiedStore.providers
    const added = unifiedStore.addedProviders

    // Only push if there are meaningful configs (with API keys)
    const hasCredentials = Object.values(configs).some(
      config => config && Object.values(config).some(v => typeof v === 'string' && v.length > 0 && v !== 'https://'),
    )
    if (!hasCredentials)
      return

    const serverChannel = useModsServerChannelStore()
    serverChannel.send({
      type: 'providers:configs:sync',
      data: { configs, added },
    })
  }

  function restoreFromBackend(data: { configs: Record<string, Record<string, unknown>>, added: Record<string, boolean> }): void {
    const unifiedStore = useUnifiedProvidersStore()
    const { configs: backendConfigs, added: backendAdded } = data

    if (!backendConfigs || Object.keys(backendConfigs).length === 0)
      return

    // Check if local has any real API keys configured
    const localHasCredentials = Object.values(unifiedStore.providers).some(
      config => config && (
        (typeof config.apiKey === 'string' && config.apiKey.length > 0)
        || (typeof config['api-key'] === 'string' && (config['api-key'] as string).length > 0)
      ),
    )

    // If local already has credentials, don't overwrite — just push to backend as backup
    if (localHasCredentials) {
      pushConfigsToBackend()
      return
    }

    // Restore from backend: pause sync to avoid echo
    syncPaused = true

    for (const [providerId, config] of Object.entries(backendConfigs)) {
      const hasKey = (typeof config.apiKey === 'string' && config.apiKey.length > 0)
        || (typeof config['api-key'] === 'string' && (config['api-key'] as string).length > 0)
      if (hasKey) {
        unifiedStore.providers[providerId] = { ...config }
      }
    }

    for (const [providerId, isAdded] of Object.entries(backendAdded)) {
      if (isAdded) {
        unifiedStore.markProviderAdded(providerId)
      }
    }

    restored.value = true
    syncPaused = false
  }

  function initialize(): void {
    if (disposers.value.length > 0)
      return

    const serverChannel = useModsServerChannelStore()

    // Listen for backend pushing saved configs (on connect or restore)
    disposers.value.push(
      serverChannel.onEvent('providers:configs:data', (event) => {
        const data = event.data as { configs: Record<string, Record<string, unknown>>, added: Record<string, boolean> }
        restoreFromBackend(data)
      }),
    )

    // Request saved configs from brain (handles cache-cleared scenario)
    serverChannel.send({
      type: 'providers:configs:request',
      data: {},
    })

    // Watch for credential changes and sync to backend (debounced)
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const unifiedStore = useUnifiedProvidersStore()
    const stopWatch = watch(
      () => unifiedStore.providers,
      () => {
        if (syncPaused)
          return
        if (debounceTimer)
          clearTimeout(debounceTimer)
        debounceTimer = setTimeout(() => pushConfigsToBackend(), 2000)
      },
      { deep: true },
    )
    disposers.value.push(stopWatch)
  }

  function dispose(): void {
    for (const d of disposers.value) {
      d()
    }
    disposers.value = []
  }

  return {
    restored,
    initialize,
    dispose,
  }
})
