import type { Client } from '@proj-airi/server-sdk'

import type { BrainStore } from '../store'

import { useLogg } from '@guiiai/logg'

const log = useLogg('brain:credentials').useGlobalConfig()

export function registerCredentialsHandler(
  client: Client,
  brainStore: BrainStore,
): void {
  client.onEvent('credentials:store', (event) => {
    const { providerId, config } = event.data as {
      providerId: string
      config: Record<string, unknown>
    }
    try {
      brainStore.setProviderCredentials(providerId, config)
      log.withFields({ providerId }).log('Credentials stored')
    }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.withFields({ providerId, error: msg }).error('Failed to store credentials')
    }
  })

  client.onEvent('credentials:get', (event) => {
    const { providerId } = event.data as { providerId: string }
    try {
      const config = brainStore.getProviderCredentials(providerId)
      client.send({
        type: 'credentials:get:result',
        data: { providerId, config },
      })
    }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.withFields({ providerId, error: msg }).error('Failed to get credentials')
      client.send({
        type: 'credentials:get:result',
        data: { providerId, config: null, error: msg },
      })
    }
  })

  client.onEvent('credentials:list', () => {
    const providerIds = brainStore.listProviderIds()
    client.send({
      type: 'credentials:list:result',
      data: { providerIds },
    })
  })

  client.onEvent('credentials:delete', (event) => {
    const { providerId } = event.data as { providerId: string }
    brainStore.deleteProviderCredentials(providerId)
    log.withFields({ providerId }).log('Credentials deleted')
  })
}
