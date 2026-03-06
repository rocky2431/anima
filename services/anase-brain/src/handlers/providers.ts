import type { Client } from '@anase/server-sdk'

import type { BrainStore } from '../store'

import { useLogg } from '@guiiai/logg'

const log = useLogg('brain:provider-sync').useGlobalConfig()

function sendSavedConfigs(client: Client, brainStore: BrainStore): void {
  const saved = brainStore.getProviderConfigs()
  const count = Object.keys(saved.configs).length
  if (count > 0) {
    log.withFields({ count }).log('Sending saved provider configs to frontend')
    client.send({
      type: 'providers:configs:data',
      data: saved,
    })
  }
}

export function registerProvidersHandler(
  client: Client,
  brainStore: BrainStore,
): void {
  // Frontend requests saved configs (on connect / after cache clear)
  client.onEvent('providers:configs:request', () => {
    log.log('Provider configs requested by frontend')
    sendSavedConfigs(client, brainStore)
  })

  // Frontend pushes its current configs for backup
  client.onEvent('providers:configs:sync', (event) => {
    const { configs, added } = event.data as {
      configs: Record<string, Record<string, unknown>>
      added: Record<string, boolean>
    }

    const count = Object.keys(configs).length
    log.withFields({ count }).log('Provider configs sync received from frontend')

    brainStore.setProviderConfigs(configs, added)
    log.withFields({ count }).log('Provider configs persisted to DB')
  })
}
