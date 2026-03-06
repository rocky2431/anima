import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

import { useModsServerChannelStore } from '../mods/api/channel-server'
import { useUnifiedProvidersStore } from '../unified-providers'

export const useProviderSyncStore = defineStore('provider-sync-module', () => {
  const disposers = ref<Array<() => void>>([])
  const restored = ref(false)
  const brainAvailable = ref(false)
  let syncPaused = false

  function syncCredentialToBrain(providerId: string, config: Record<string, unknown>): void {
    const serverChannel = useModsServerChannelStore()
    serverChannel.send({
      type: 'credentials:store',
      data: { providerId, config },
    })
  }

  function deleteCredentialFromBrain(providerId: string): void {
    const serverChannel = useModsServerChannelStore()
    serverChannel.send({
      type: 'credentials:delete',
      data: { providerId },
    })
  }

  function syncCredentialsFromBrain(): Promise<void> {
    const serverChannel = useModsServerChannelStore()
    const unifiedStore = useUnifiedProvidersStore()

    return new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        brainAvailable.value = false
        resolve()
      }, 5000)

      const disposeListResult = serverChannel.onEvent('credentials:list:result', (event) => {
        clearTimeout(timeout)
        brainAvailable.value = true
        disposeListResult()

        const { providerIds } = event.data as { providerIds: string[] }

        if (providerIds.length === 0) {
          // Brain has no credentials: push local credentials to Brain
          pushAllCredentialsToBrain()
          resolve()
          return
        }

        // Fetch each provider's config from Brain
        let remaining = providerIds.length
        const getResultDisposers: Array<() => void> = []

        for (const providerId of providerIds) {
          const disposeGetResult = serverChannel.onEvent('credentials:get:result', (getEvent) => {
            const data = getEvent.data as { providerId: string, config: Record<string, unknown> | null }
            if (data.providerId !== providerId)
              return

            disposeGetResult()
            const idx = getResultDisposers.indexOf(disposeGetResult)
            if (idx !== -1)
              getResultDisposers.splice(idx, 1)

            if (data.config) {
              syncPaused = true
              unifiedStore.providers[providerId] = { ...data.config }
              syncPaused = false
            }

            remaining--
            if (remaining <= 0) {
              restored.value = true
              resolve()
            }
          })

          getResultDisposers.push(disposeGetResult)

          serverChannel.send({
            type: 'credentials:get',
            data: { providerId },
          })
        }
      })

      serverChannel.send({
        type: 'credentials:list',
        data: {},
      })
    })
  }

  function pushAllCredentialsToBrain(): void {
    const unifiedStore = useUnifiedProvidersStore()
    const configs = unifiedStore.providers

    for (const [providerId, config] of Object.entries(configs)) {
      if (!config)
        continue

      const hasKey = (typeof config.apiKey === 'string' && config.apiKey.length > 0)
        || (typeof config['api-key'] === 'string' && (config['api-key'] as string).length > 0)

      if (hasKey) {
        syncCredentialToBrain(providerId, config)
      }
    }
  }

  // Legacy sync for backwards compatibility when Brain is not available
  function pushConfigsToBackend(): void {
    if (syncPaused)
      return

    const unifiedStore = useUnifiedProvidersStore()
    const configs = unifiedStore.providers
    const added = unifiedStore.addedProviders

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
    // Skip legacy restore if Brain credentials are already available
    if (brainAvailable.value)
      return

    const unifiedStore = useUnifiedProvidersStore()
    const { configs: backendConfigs, added: backendAdded } = data

    if (!backendConfigs || Object.keys(backendConfigs).length === 0)
      return

    const localHasCredentials = Object.values(unifiedStore.providers).some(
      config => config && (
        (typeof config.apiKey === 'string' && config.apiKey.length > 0)
        || (typeof config['api-key'] === 'string' && (config['api-key'] as string).length > 0)
      ),
    )

    if (localHasCredentials) {
      pushConfigsToBackend()
      return
    }

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

    // Listen for legacy backend pushing saved configs
    disposers.value.push(
      serverChannel.onEvent('providers:configs:data', (event) => {
        const data = event.data as { configs: Record<string, Record<string, unknown>>, added: Record<string, boolean> }
        restoreFromBackend(data)
      }),
    )

    // Try new Brain credentials API first
    void syncCredentialsFromBrain().then(() => {
      if (!brainAvailable.value) {
        // Fallback: request from legacy endpoint
        serverChannel.send({
          type: 'providers:configs:request',
          data: {},
        })
      }
    })

    // Watch for credential changes and sync appropriately
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const unifiedStore = useUnifiedProvidersStore()
    const stopWatch = watch(
      () => unifiedStore.providers,
      (_newCreds, oldCreds) => {
        if (syncPaused)
          return

        if (debounceTimer)
          clearTimeout(debounceTimer)

        debounceTimer = setTimeout(() => {
          if (brainAvailable.value) {
            // Sync changed providers to Brain encrypted store
            const currentCreds = unifiedStore.providers
            for (const [providerId, config] of Object.entries(currentCreds)) {
              if (!config)
                continue

              const oldConfig = oldCreds?.[providerId]
              if (JSON.stringify(config) !== JSON.stringify(oldConfig)) {
                syncCredentialToBrain(providerId, config)
              }
            }
            // Detect deleted providers
            if (oldCreds) {
              for (const providerId of Object.keys(oldCreds)) {
                if (!(providerId in currentCreds)) {
                  deleteCredentialFromBrain(providerId)
                }
              }
            }
          }
          else {
            pushConfigsToBackend()
          }
        }, 2000)
      },
      { deep: true },
    )
    disposers.value.push(stopWatch)

    // Re-sync on reconnection
    const stopConnectedWatch = watch(
      () => serverChannel.connected,
      (isConnected, wasConnected) => {
        if (isConnected && !wasConnected) {
          void syncCredentialsFromBrain()
        }
      },
    )
    disposers.value.push(stopConnectedWatch)
  }

  function dispose(): void {
    for (const d of disposers.value) {
      d()
    }
    disposers.value = []
  }

  return {
    restored,
    brainAvailable,
    initialize,
    dispose,
  }
})
