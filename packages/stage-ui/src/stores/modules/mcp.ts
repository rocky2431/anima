import type { McpServerConfigInput, RecommendedMcpServer, TransportType } from '@proj-airi/mcp-hub'

import { getRecommendedServers } from '@proj-airi/mcp-hub'
import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { useConfiguratorByModsChannelServer } from '../configurator'

export type McpServerStatus = 'connected' | 'disconnected' | 'error'

export interface McpServerUiConfig {
  id: string
  name: string
  transport: TransportType
  enabled: boolean
  command?: string
  args?: string[]
  url?: string
  headers?: Record<string, string>
}

export const useMcpModuleStore = defineStore('mcp-module', () => {
  const configurator = useConfiguratorByModsChannelServer()

  const servers = useLocalStorageManualReset<McpServerUiConfig[]>('settings/mcp/servers', [])
  const serverStatuses = ref<Record<string, McpServerStatus>>({})

  const recommendedServers = computed<RecommendedMcpServer[]>(() => getRecommendedServers())

  const connectedCount = computed(() => {
    return Object.values(serverStatuses.value).filter(s => s === 'connected').length
  })

  const configured = computed(() => servers.value.length > 0)

  function addServer(input: Omit<McpServerUiConfig, 'id'>): McpServerUiConfig {
    const config: McpServerUiConfig = { ...input, id: nanoid() }
    servers.value = [...servers.value, config]
    serverStatuses.value[config.id] = 'disconnected'
    broadcastConfig()
    return config
  }

  function removeServer(id: string): void {
    servers.value = servers.value.filter(s => s.id !== id)
    const { [id]: _, ...rest } = serverStatuses.value
    serverStatuses.value = rest
    broadcastConfig()
  }

  function updateServer(id: string, partial: Partial<Omit<McpServerUiConfig, 'id'>>): void {
    servers.value = servers.value.map(s =>
      s.id === id ? { ...s, ...partial } : s,
    )
    broadcastConfig()
  }

  function addFromRecommended(recommendedId: string): McpServerUiConfig | undefined {
    const rec = recommendedServers.value.find(r => r.id === recommendedId)
    if (!rec)
      return undefined

    return addServer({
      name: rec.name,
      transport: rec.transport,
      enabled: true,
      command: rec.command,
      args: rec.args,
      url: rec.url,
    })
  }

  function updateStatus(id: string, status: McpServerStatus): void {
    serverStatuses.value = { ...serverStatuses.value, [id]: status }
  }

  function getStatus(id: string): McpServerStatus {
    return serverStatuses.value[id] ?? 'disconnected'
  }

  function toBackendConfig(server: McpServerUiConfig): McpServerConfigInput {
    const base = { name: server.name, enabled: server.enabled }
    if (server.transport === 'stdio') {
      return { ...base, transport: 'stdio', command: server.command ?? '', args: server.args }
    }
    return { ...base, transport: server.transport, url: server.url ?? '', headers: server.headers }
  }

  function broadcastConfig(): void {
    configurator.updateFor('mcp', {
      servers: servers.value.map(toBackendConfig),
    })
  }

  function saveSettings(): void {
    broadcastConfig()
  }

  function resetState(): void {
    servers.reset()
    serverStatuses.value = {}
    broadcastConfig()
  }

  return {
    servers,
    serverStatuses,
    recommendedServers,
    connectedCount,
    configured,
    addServer,
    removeServer,
    updateServer,
    addFromRecommended,
    updateStatus,
    getStatus,
    saveSettings,
    resetState,
  }
})
