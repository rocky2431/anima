import type { Client } from '@proj-airi/server-sdk'

import type { BrainProviders } from '../providers'
import type { BrainStore, EmbeddingConfig } from '../store'

import { useLogg } from '@guiiai/logg'

import { createEmbeddingHandle } from '../providers'

const log = useLogg('brain:embedding').useGlobalConfig()

function pushStatus(client: Client, config: EmbeddingConfig): void {
  const configured = !!(config.provider && config.apiKey && config.baseURL && config.model)
  client.send({
    type: 'embedding:config:status',
    data: {
      configured,
      provider: configured ? config.provider : undefined,
      model: configured ? config.model : undefined,
    },
  })
}

export function registerEmbeddingHandler(
  client: Client,
  brainStore: BrainStore,
  providers: BrainProviders,
): void {
  // Load persisted config and apply if complete
  const persisted = brainStore.getEmbeddingConfig()
  if (persisted.provider && persisted.apiKey && persisted.baseURL && persisted.model) {
    providers.embedding = createEmbeddingHandle(persisted)
    providers.embeddingConfig = persisted
    log.log('Embedding provider restored from DB', { provider: persisted.provider, model: persisted.model })
  }

  client.onEvent('embedding:config:update', (event) => {
    const config = event.data as EmbeddingConfig
    log.withFields({ provider: config.provider, model: config.model }).log('Embedding config update received')

    brainStore.setEmbeddingConfig(config)

    if (config.provider && config.apiKey && config.baseURL && config.model) {
      providers.embedding = createEmbeddingHandle(config)
      providers.embeddingConfig = config
      log.log('Embedding provider configured', { provider: config.provider, model: config.model })
    }
    else {
      providers.embedding = null
      providers.embeddingConfig = null
      log.log('Embedding provider cleared (incomplete config)')
    }

    pushStatus(client, config)
  })

  // Push initial status after a short delay (same pattern as vision)
  setTimeout(() => pushStatus(client, persisted), 1000)
}
