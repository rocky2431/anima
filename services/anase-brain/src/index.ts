import process, { env } from 'node:process'

import { mkdirSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { resolve } from 'node:path'

import { Format, LogLevel, setGlobalFormat, setGlobalLogLevel, useLogg } from '@guiiai/logg'
import { DocumentStore, VectorStore } from '@anase/context-engine'
import { Client } from '@anase/server-sdk'

import { registerActivityHandler } from './handlers/activity'
import { registerCredentialsHandler } from './handlers/credentials'
import { disposeDesktopShellHandler, registerDesktopShellHandler } from './handlers/desktop-shell'
import { registerEmbeddingHandler } from './handlers/embedding'
import { registerEveningPipeline } from './handlers/evening-pipeline'
import { registerLlmHandler } from './handlers/llm'
import { registerMemoryHandler } from './handlers/memory'
import { disposePersonaHandler, registerPersonaHandler } from './handlers/persona'
import { registerProvidersHandler } from './handlers/providers'
import { getSkillsContextText, registerSkillsHandler } from './handlers/skills'
import { registerTodoHandler } from './handlers/todo'
import { disposeVisionHandler, registerVisionHandler } from './handlers/vision'
import { createPipeline, rebuildPipeline } from './pipeline'
import { createBrainProviders } from './providers'
import { BrainStore } from './store'

setGlobalFormat(Format.Pretty)
setGlobalLogLevel(LogLevel.Log)
const log = useLogg('anase-brain').useGlobalConfig()

// Default WebSocket URL for local development — override via ANASE_URL env var
const DEV_DEFAULT_WS = ['ws://', '127.0.0.1', ':6121/ws'].join('')

function getDefaultDataDir(): string {
  const home = homedir()
  switch (platform()) {
    case 'darwin':
      return resolve(home, 'Library', 'Application Support', 'anase', 'data')
    case 'win32':
      return resolve(env.APPDATA ?? resolve(home, 'AppData', 'Roaming'), 'anase', 'data')
    default: // linux / other
      return resolve(env.XDG_DATA_HOME ?? resolve(home, '.local', 'share'), 'anase', 'data')
  }
}

async function main(): Promise<void> {
  const url = env.ANASE_URL ?? env.ANASE_WS_URL ?? DEV_DEFAULT_WS
  const token = env.ANASE_TOKEN ?? 'abcd'
  const dataDir = resolve(env.ANASE_DATA_DIR ?? getDefaultDataDir())

  // Ensure data directory exists
  mkdirSync(dataDir, { recursive: true })

  // Initialize storage
  const dbPath = resolve(dataDir, 'anima.db')
  const documentStore = new DocumentStore(dbPath)
  const brainStore = new BrainStore(documentStore.getDatabase())

  // Validate encryption key for credential security
  const encryptionKey = env.ANASE_ENCRYPTION_KEY
  if (!encryptionKey) {
    log.warn('ANASE_ENCRYPTION_KEY not set — credentials will be stored in plaintext. Set a 64-character hex key for production use.')
  }
  else if (encryptionKey.length !== 64 || !/^[\da-f]+$/i.test(encryptionKey)) {
    log.error('ANASE_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes for AES-256). Credential encryption will fail.')
  }

  // Initialize LLM/Embedding provider configuration
  // Use mutable binding so handlers can update providers at runtime
  const providers = createBrainProviders() as ReturnType<typeof createBrainProviders>

  // Shared timer reference so graceful shutdown can cancel pending pipeline rebuilds
  let rebuildTimer: ReturnType<typeof setTimeout> | null = null

  log.withFields({ url, tokenPresent: !!env.ANASE_TOKEN, dataDir, dbPath, llmConfigured: !!providers.llm, embeddingConfigured: !!providers.embedding }).log('Starting anase-brain bridge')

  const client = new Client({
    name: 'anase-brain',
    url,
    token,
    possibleEvents: [
      // Persona
      'persona:emotion:state',
      'persona:intimacy:state',
      'persona:proactive:trigger',
      // Vision
      'vision:config:update',
      'vision:status',
      // LLM
      'llm:config:update',
      'llm:config:status',
      // Embedding
      'embedding:config:update',
      'embedding:config:status',
      'embedding:models:list',
      'embedding:models:result',
      'embedding:model:validate',
      'embedding:model:validated',
      // Persona Template
      'persona:template:set',
      // Todo
      'todo:list',
      'todo:create',
      'todo:update',
      'todo:delete',
      'todo:suggestions',
      // Memory
      'memory:list',
      'memory:search',
      'memory:search:result',
      'memory:delete',
      'memory:deleted',
      // Activity
      'activity:state',
      'activity:summary',
      'activity:history:request',
      // Skills
      'skills:list',
      'skills:toggle',
      'skills:toggled',
      // Provider Config Sync
      'providers:configs:sync',
      'providers:configs:request',
      'providers:configs:data',
      // Credentials
      'credentials:store',
      'credentials:get',
      'credentials:get:result',
      'credentials:list',
      'credentials:list:result',
      'credentials:delete',
      // Activity Summary
      'activity:summary:trigger',
    ],
  })

  // Wait for authentication before registering handlers
  client.onEvent('module:authenticated', (event) => {
    if (!event.data.authenticated) {
      log.warn('Authentication failed')
      return
    }

    log.log('Authenticated, registering handlers')

    registerTodoHandler(client, documentStore)
    registerMemoryHandler(client, documentStore)
    registerActivityHandler(client, brainStore)
    registerSkillsHandler(client, brainStore)
    registerPersonaHandler(client, documentStore, brainStore)
    registerVisionHandler(client, brainStore)
    registerEmbeddingHandler(client, brainStore, providers)
    registerLlmHandler(client, brainStore, providers)
    registerProvidersHandler(client, brainStore)
    registerCredentialsHandler(client, brainStore)
    registerDesktopShellHandler(client, brainStore)

    // Initialize VectorStore + Pipeline (async, non-blocking)
    VectorStore.create(dataDir).then(async (vectorStore) => {
      log.log('VectorStore created', { dataDir })

      const pipelineRef = { current: await createPipeline({ vectorStore, documentStore, providers, additionalSystemContext: getSkillsContextText() }) }

      // Register evening pipeline for daily summaries
      registerEveningPipeline(brainStore, pipelineRef, client)

      // Rebuild pipeline when LLM, embedding, or skills config changes (debounced).
      // Generation counter ensures stale rebuilds don't overwrite newer ones.
      let rebuildGeneration = 0
      function scheduleRebuild(): void {
        if (rebuildTimer)
          clearTimeout(rebuildTimer)
        rebuildTimer = setTimeout(() => {
          rebuildTimer = null
          const gen = ++rebuildGeneration
          rebuildPipeline(pipelineRef.current, { documentStore, providers, additionalSystemContext: getSkillsContextText() })
            .then((rebuilt) => {
              if (gen === rebuildGeneration)
                pipelineRef.current = rebuilt
            })
            .catch((err) => {
              const msg = err instanceof Error ? err.message : String(err)
              log.withFields({ error: msg }).warn('Pipeline rebuild failed')
            })
        }, 200)
      }
      client.onEvent('llm:config:update', scheduleRebuild)
      client.onEvent('embedding:config:update', scheduleRebuild)
      // skills:toggle handler in skills.ts synchronously mutates the registry,
      // so getSkillsContextText() in the debounced callback always sees the updated state.
      client.onEvent('skills:toggle', scheduleRebuild)

      log.log('Pipeline initialized')
    }).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err)
      log.withFields({ error: msg }).error('Failed to initialize VectorStore/Pipeline — memory features disabled')
      // VectorStore init failed — memory features unavailable (logged at error level above)
    })

    log.log('All handlers registered — anase-brain is ready')
  })

  // Graceful shutdown
  async function gracefulShutdown(signal: string): Promise<void> {
    log.log(`Received ${signal}, shutting down...`)
    if (rebuildTimer) {
      clearTimeout(rebuildTimer)
      rebuildTimer = null
    }
    const disposers = [
      { name: 'persona', fn: disposePersonaHandler },
      { name: 'vision', fn: disposeVisionHandler },
      { name: 'desktop-shell', fn: disposeDesktopShellHandler },
      { name: 'client', fn: () => client.close() },
      { name: 'documentStore', fn: () => documentStore.close() },
    ]
    for (const { name, fn } of disposers) {
      try {
        fn()
      }
      catch (err) {
        log.withFields({ name, error: String(err) }).warn('Cleanup failed during shutdown')
      }
    }
    process.exit(0)
  }

  process.on('SIGINT', () => void gracefulShutdown('SIGINT'))
  process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'))
}

main().catch(err => log.withError(err).error('Failed to start anase-brain'))
