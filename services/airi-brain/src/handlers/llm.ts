import type { Client } from '@proj-airi/server-sdk'

import type { BrainProviders } from '../providers'
import type { BrainStore, LlmConfig } from '../store'

import { useLogg } from '@guiiai/logg'

import { createLlmHandle } from '../providers'

const log = useLogg('brain:llm').useGlobalConfig()

function pushStatus(client: Client, config: LlmConfig): void {
  const configured = !!(config.provider && config.apiKey && config.baseURL && config.model)
  client.send({
    type: 'llm:config:status',
    data: {
      configured,
      provider: configured ? config.provider : undefined,
      model: configured ? config.model : undefined,
    },
  })
}

export function registerLlmHandler(
  client: Client,
  brainStore: BrainStore,
  providers: BrainProviders,
): void {
  // Load persisted config and apply if complete
  const persisted = brainStore.getLlmConfig()
  if (persisted.provider && persisted.apiKey && persisted.baseURL && persisted.model) {
    providers.llm = createLlmHandle(persisted)
    providers.llmConfig = persisted
    log.log('LLM provider restored from DB', { provider: persisted.provider, model: persisted.model })
  }

  client.onEvent('llm:config:update', (event) => {
    const config = event.data as LlmConfig
    log.withFields({ provider: config.provider, model: config.model }).log('LLM config update received')

    brainStore.setLlmConfig(config)

    if (config.provider && config.apiKey && config.baseURL && config.model) {
      providers.llm = createLlmHandle(config)
      providers.llmConfig = config
      log.log('LLM provider configured', { provider: config.provider, model: config.model })
    }
    else {
      providers.llm = null
      providers.llmConfig = null
      log.log('LLM provider cleared (incomplete config)')
    }

    pushStatus(client, config)
  })

  // Push initial status after a short delay
  setTimeout(() => pushStatus(client, persisted), 1000)
}
