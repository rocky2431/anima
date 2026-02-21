import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { useModsServerChannelStore } from '../mods/api/channel-server'

export const useDesktopShellStore = defineStore('desktop-shell-module', () => {
  // Persisted config (localStorage)
  const windowPollingEnabled = useLocalStorage('settings/desktop-shell/window-polling-enabled', true)
  const windowPollingIntervalMs = useLocalStorage('settings/desktop-shell/window-polling-interval-ms', 10000)
  const clipboardMonitoringEnabled = useLocalStorage('settings/desktop-shell/clipboard-monitoring-enabled', true)
  const shortcutsEnabled = useLocalStorage('settings/desktop-shell/shortcuts-enabled', true)

  // Runtime state
  const currentAppName = ref('')
  const currentWindowTitle = ref('')
  const lastActivityTimestamp = ref<number | null>(null)
  const disposers = ref<Array<() => void>>([])

  const configured = computed(() => {
    return windowPollingEnabled.value || clipboardMonitoringEnabled.value || shortcutsEnabled.value
  })

  function initialize(): void {
    const serverChannel = useModsServerChannelStore()

    disposers.value.push(
      serverChannel.onEvent('activity:state', (event) => {
        const latest = event.data.activities.at(-1)
        if (!latest)
          return
        currentAppName.value = latest.app ?? ''
        currentWindowTitle.value = latest.description ?? ''
        lastActivityTimestamp.value = latest.timestamp ?? Date.now()
      }),
    )
  }

  function dispose(): void {
    for (const d of disposers.value) {
      d()
    }
    disposers.value = []
  }

  return {
    // Config
    windowPollingEnabled,
    windowPollingIntervalMs,
    clipboardMonitoringEnabled,
    shortcutsEnabled,
    configured,

    // Runtime
    currentAppName,
    currentWindowTitle,
    lastActivityTimestamp,

    // Actions
    initialize,
    dispose,
  }
})
