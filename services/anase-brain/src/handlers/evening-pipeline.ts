import type { Client } from '@anase/server-sdk'

import type { PipelineComponents } from '../pipeline'
import type { BrainStore } from '../store'

import { useLogg } from '@guiiai/logg'

const log = useLogg('brain:evening-pipeline').useGlobalConfig()

/**
 * Run the evening summary pipeline:
 * 1. Fetch today's activity events
 * 2. Generate daily summary via ReportGenerator
 * 3. Extract memories via MemoryExtractor
 * 4. Persist results to store + vector DB
 * 5. Push summary to frontend
 */
async function runEveningPipeline(
  brainStore: BrainStore,
  pipeline: PipelineComponents,
  client: Client,
): Promise<void> {
  if (!pipeline.reportGenerator || !pipeline.memoryExtractor || !pipeline.orchestrator) {
    log.warn('Evening pipeline skipped — LLM or embedding not configured')
    return
  }

  const today = new Date().toISOString().slice(0, 10)
  const events = brainStore.getActivityEvents({ date: today, limit: 500 })

  if (events.length === 0) {
    log.log('No activity events for today, skipping evening pipeline')
    return
  }

  log.log('Evening pipeline started', { date: today, eventCount: events.length })

  // Phase 1: Generate daily summary
  const activities = events.map(e => ({
    activity: {
      continuousWorkDurationMs: e.durationMs,
      currentApp: e.appName,
      currentWindowTitle: e.windowTitle,
      isFullscreen: false,
      lastActivityTimestamp: e.timestamp,
      isActive: true,
      recentApps: [e.appName],
    },
    timestamp: e.timestamp,
  }))

  const summary = await pipeline.reportGenerator.generate(activities)
  brainStore.upsertActivitySummary({
    date: today,
    highlights: summary.highlights,
    breakdown: summary.activityBreakdown,
    totalWorkDurationMs: summary.totalWorkDurationMs,
  })
  log.log('Daily summary generated', { highlights: summary.highlights.length })

  // Phase 2: Extract memories
  const extractionInput = {
    conversations: [],
    activities: events.map(e => ({
      app: e.appName,
      description: e.description,
      timestamp: e.timestamp,
    })),
    todos: [],
  }
  const extraction = await pipeline.memoryExtractor.extract(extractionInput, [])
  log.log('Memories extracted', { memories: extraction.memories.length, facts: extraction.profileFacts.length })

  // Phase 3: Persist to vector DB + document store
  await pipeline.orchestrator.persistExtractionResults(extraction)
  log.log('Extraction results persisted to vector store')

  // Phase 4: Push summary to frontend
  client.send({
    type: 'activity:summary',
    data: {
      date: summary.date,
      highlights: summary.highlights,
      activityBreakdown: summary.activityBreakdown,
      totalWorkDurationMs: summary.totalWorkDurationMs,
      personalNote: summary.personalNote,
    },
  })

  log.log('Evening pipeline completed', {
    memories: extraction.memories.length,
    facts: extraction.profileFacts.length,
    relationships: extraction.relationships.length,
  })
}

export function registerEveningPipeline(
  brainStore: BrainStore,
  pipeline: { current: PipelineComponents },
  client: Client,
  cronService?: { registerHandler: (name: string, fn: () => Promise<void>) => void, cron: (expression: string, options: { name: string, handler: string }) => string },
): void {
  const handler = async () => {
    try {
      await runEveningPipeline(brainStore, pipeline.current, client)
    }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.withFields({ error: msg }).error('Evening pipeline failed')
      // Error logged above; no frontend event sent since ActivitySummaryEvent schema doesn't include error field
    }
  }

  if (cronService) {
    cronService.registerHandler('evening-summary', handler)
    cronService.cron('0 23 * * *', {
      name: 'evening-summary',
      handler: 'evening-summary',
    })
    log.log('Evening pipeline registered (cron: 0 23 * * *)')
  }
  else {
    log.log('Evening pipeline registered (manual trigger only, no cron service)')
  }

  // Manual trigger via event
  client.onEvent('activity:summary:trigger', async () => {
    log.log('Evening pipeline manually triggered')
    await handler()
  })
}
