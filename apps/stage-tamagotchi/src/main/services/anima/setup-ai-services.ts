import type { AiOrchestrator } from './ai-orchestrator'

import { resolve } from 'node:path'

import { useLogg } from '@guiiai/logg'
import { CronService } from '@proj-airi/cron-service'
import { app } from 'electron'

import { createAiOrchestrator } from './ai-orchestrator'

const log = useLogg('ai-services').useGlobalConfig()

export interface AiServicesHandle {
  cronService: CronService
  aiOrchestrator: AiOrchestrator
  stop: () => Promise<void>
}

/**
 * Initialize AI-layer services: CronService and AiOrchestrator.
 * AiOrchestrator owns McpHub + SkillRegistry internally.
 */
export async function setupAiServices(): Promise<AiServicesHandle> {
  const dataDir = resolve(app.getPath('userData'), 'data')

  const cronDbPath = resolve(dataDir, 'cron.db')
  const mcpDbPath = resolve(dataDir, 'mcp-hub.db')
  const builtinSkillsDir = resolve(dataDir, 'skills', 'builtin')
  const userSkillsDir = resolve(dataDir, 'skills', 'user')

  // --- CronService ---
  const cronService = new CronService(cronDbPath)
  cronService.start()
  log.log('CronService started', { dbPath: cronDbPath })

  // --- AiOrchestrator (owns McpHub + SkillRegistry internally) ---
  const brainDbPath = resolve(dataDir, 'anima.db')
  const aiOrchestrator = createAiOrchestrator({
    mcpDbPath,
    builtinSkillsDir,
    userSkillsDir,
    brainDbPath,
  })

  const initResult = await aiOrchestrator.initialize()
  log.withFields({
    mcpConnected: initResult.mcpConnected.length,
    mcpFailed: initResult.mcpFailed.length,
    skillsLoaded: initResult.skillsLoaded,
  }).log('AiOrchestrator initialized')

  return {
    cronService,
    aiOrchestrator,
    async stop() {
      try {
        cronService.close()
        log.log('CronService stopped')
      }
      catch (err) {
        log.withError(err).error('CronService shutdown error')
      }
      try {
        await aiOrchestrator.shutdown()
        log.log('AiOrchestrator shut down')
      }
      catch (err) {
        log.withError(err).error('AiOrchestrator shutdown error')
      }
    },
  }
}
