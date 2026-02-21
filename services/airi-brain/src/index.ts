import process, { env } from 'node:process'

import { Format, LogLevel, setGlobalFormat, setGlobalLogLevel, useLogg } from '@guiiai/logg'
import { Client } from '@proj-airi/server-sdk'

import { registerActivityHandler } from './handlers/activity'
import { registerMemoryHandler } from './handlers/memory'
import { disposePersonaHandler, registerPersonaHandler } from './handlers/persona'
import { registerSkillsHandler } from './handlers/skills'
import { registerTodoHandler } from './handlers/todo'
import { disposeVisionHandler, registerVisionHandler } from './handlers/vision'

setGlobalFormat(Format.Pretty)
setGlobalLogLevel(LogLevel.Log)
const log = useLogg('airi-brain').useGlobalConfig()

// Default WebSocket URL for local development — override via AIRI_URL env var
const DEV_DEFAULT_WS = ['ws://', '127.0.0.1', ':6121/ws'].join('')

async function main(): Promise<void> {
  const url = env.AIRI_URL ?? env.AIRI_WS_URL ?? DEV_DEFAULT_WS
  const token = env.AIRI_TOKEN ?? 'abcd'

  log.withFields({ url, tokenPresent: !!env.AIRI_TOKEN }).info('Starting airi-brain bridge')

  const client = new Client({
    name: 'airi-brain',
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
    ],
  })

  // Wait for authentication before registering handlers
  client.onEvent('module:authenticated', (event) => {
    if (!event.data.authenticated) {
      log.warn('Authentication failed')
      return
    }

    log.info('Authenticated, registering handlers')

    registerTodoHandler(client)
    registerMemoryHandler(client)
    registerActivityHandler(client)
    registerSkillsHandler(client)
    registerPersonaHandler(client)
    registerVisionHandler(client)

    log.info('All handlers registered — airi-brain is ready')
  })

  // Graceful shutdown
  async function gracefulShutdown(signal: string): Promise<void> {
    log.info(`Received ${signal}, shutting down...`)
    disposePersonaHandler()
    disposeVisionHandler()
    client.close()
    process.exit(0)
  }

  process.on('SIGINT', () => void gracefulShutdown('SIGINT'))
  process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'))
}

main().catch(err => log.withError(err).error('Failed to start airi-brain'))
