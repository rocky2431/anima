import type { Client } from '@proj-airi/server-sdk'

import type { BrainProviders } from '../providers'
import type { BrainStore, EmbeddingConfig } from '../store'

import { useLogg } from '@guiiai/logg'

import { createEmbeddingHandle } from '../providers'

const log = useLogg('brain:embedding').useGlobalConfig()

const ALLOWED_BASE_URL_HOSTS = new Set([
  'openrouter.ai',
  'api.openai.com',
  'dashscope.aliyuncs.com',
  'api.anthropic.com',
  'api.cohere.com',
  'api.mistral.ai',
  'generativelanguage.googleapis.com',
  'api.deepseek.com',
  'api.siliconflow.cn',
  'api.together.xyz',
  'api.groq.com',
])

function validateBaseURL(baseURL: string): URL {
  const trimmed = (baseURL || '').trim()
  if (!trimmed)
    throw new Error('baseURL is required')

  let normalized = trimmed
  if (!normalized.endsWith('/'))
    normalized += '/'

  const parsed = new URL(normalized)

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
    throw new Error(`Unsupported protocol: ${parsed.protocol}`)

  // Block private/internal IP ranges
  const hostname = parsed.hostname
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
    || hostname.startsWith('10.') || hostname.startsWith('192.168.')
    || hostname.startsWith('172.16.') || hostname.startsWith('172.17.')
    || hostname.startsWith('172.18.') || hostname.startsWith('172.19.')
    || hostname.startsWith('172.2') || hostname.startsWith('172.30.')
    || hostname.startsWith('172.31.') || hostname.endsWith('.local')
    || hostname === '0.0.0.0' || hostname === '169.254.169.254') {
    throw new Error(`baseURL points to private/internal address: ${hostname}`)
  }

  // Verify host is in allowlist
  const hostParts = hostname.split('.')
  const domain = hostParts.slice(-2).join('.')
  const fullDomain = hostParts.slice(-3).join('.')
  if (!ALLOWED_BASE_URL_HOSTS.has(hostname) && !ALLOWED_BASE_URL_HOSTS.has(domain) && !ALLOWED_BASE_URL_HOSTS.has(fullDomain)) {
    log.withFields({ hostname }).warn('baseURL host not in allowlist, proceeding with caution')
  }

  return parsed
}

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

  // Proxy embedding model listing (browser can't call these endpoints due to CORS)
  client.onEvent('embedding:models:list', async (event) => {
    const { provider, apiKey, baseURL } = event.data as { provider: string, apiKey: string, baseURL: string }
    log.withFields({ provider }).log('Embedding models list requested')

    try {
      const base = validateBaseURL(baseURL)

      const headers = { Authorization: `Bearer ${apiKey}` }

      // Strategy 1: Try dedicated /embeddings/models endpoint (OpenRouter)
      const embeddingsUrl = new URL('embeddings/models', base.href)
      const embeddingsResponse = await fetch(embeddingsUrl, { headers }).catch(() => null)

      if (embeddingsResponse?.ok) {
        const json = await embeddingsResponse.json() as { data?: Array<{ id: string, name?: string, description?: string, context_length?: number }> }
        const models = (json.data ?? []).map(m => ({
          id: m.id,
          name: m.name || m.id,
          provider,
          description: m.description || '',
          contextLength: m.context_length || 0,
        }))

        if (models.length > 0) {
          client.send({ type: 'embedding:models:result', data: { provider, models } })
          log.withFields({ provider, count: models.length, source: 'embeddings/models' }).log('Embedding models listed')
          return
        }
      }

      // Strategy 2: Fall back to /models and filter by ID pattern (DashScope, etc.)
      const modelsUrl = new URL('models', base.href)
      const modelsResponse = await fetch(modelsUrl, { headers })

      if (!modelsResponse.ok) {
        client.send({
          type: 'embedding:models:result',
          data: { provider, models: [], error: `HTTP ${modelsResponse.status}` },
        })
        return
      }

      const modelsJson = await modelsResponse.json() as { data?: Array<{ id: string, name?: string, description?: string, context_length?: number }> }
      const allModels = modelsJson.data ?? []
      const embeddingModels = allModels
        .filter(m => m.id.toLowerCase().includes('embed'))
        .map(m => ({
          id: m.id,
          name: m.name || m.id,
          provider,
          description: m.description || '',
          contextLength: m.context_length || 0,
        }))

      client.send({ type: 'embedding:models:result', data: { provider, models: embeddingModels } })
      log.withFields({ provider, count: embeddingModels.length, source: 'models (filtered)' }).log('Embedding models listed')
    }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.withFields({ provider, error: msg }).log('Failed to list embedding models')
      client.send({
        type: 'embedding:models:result',
        data: { provider, models: [], error: msg },
      })
    }
  })

  // Validate embedding model by sending a real embedding request
  client.onEvent('embedding:model:validate', async (event) => {
    const { provider, apiKey, baseURL, model } = event.data as { provider: string, apiKey: string, baseURL: string, model: string }
    log.withFields({ provider, model }).log('Embedding model validation requested')

    try {
      const base = validateBaseURL(baseURL)

      const url = new URL('embeddings', base.href)
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          input: 'test',
        }),
      })

      if (!response.ok) {
        const body = await response.text().catch(() => '')
        let errorMsg = `HTTP ${response.status}`
        try {
          const parsed = JSON.parse(body) as { error?: { message?: string } }
          if (parsed.error?.message)
            errorMsg = parsed.error.message
        }
        catch (parseErr) {
          log.withFields({ provider, model, rawBody: body.slice(0, 200), error: String(parseErr) }).debug('Could not parse error body as JSON, using HTTP status')
        }

        log.withFields({ provider, model, error: errorMsg }).log('Embedding model validation failed')
        client.send({ type: 'embedding:model:validated', data: { success: false, error: errorMsg } })
        return
      }

      log.withFields({ provider, model }).log('Embedding model validation succeeded')
      client.send({ type: 'embedding:model:validated', data: { success: true } })
    }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.withFields({ provider, model, error: msg }).log('Embedding model validation error')
      client.send({ type: 'embedding:model:validated', data: { success: false, error: msg } })
    }
  })

  // Push initial status after a short delay (same pattern as vision)
  setTimeout(() => pushStatus(client, persisted), 1000)
}
