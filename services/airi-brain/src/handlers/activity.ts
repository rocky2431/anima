import type { Client } from '@proj-airi/server-sdk'

import { useLogg } from '@guiiai/logg'

const log = useLogg('brain:activity').useGlobalConfig()

/**
 * Activity handler — primarily push-based from the brain to the UI.
 * The brain monitors system activity and pushes state/summary updates.
 * For the walking skeleton, we simulate periodic activity pushes.
 */
export function registerActivityHandler(client: Client): void {
  // Push an initial summary on connect
  const initialSummary = {
    date: new Date().toISOString().slice(0, 10),
    highlights: [
      'Started a new coding session',
      'Reviewed project architecture',
    ],
    activityBreakdown: [
      { app: 'VS Code', durationMs: 3_600_000, description: 'Code editing' },
      { app: 'Browser', durationMs: 1_800_000, description: 'Documentation' },
    ],
    totalWorkDurationMs: 5_400_000,
    personalNote: 'Productive morning session',
  }

  // Delay initial push slightly to let the UI subscribe
  setTimeout(() => {
    client.send({
      type: 'activity:summary',
      data: initialSummary,
    })
    log.info('Pushed initial activity summary')
  }, 2000)

  client.onEvent('activity:history:request', (event) => {
    const { date, limit = 50 } = event.data as { date?: string, limit?: number }
    log.info('Activity history request', { date, limit })

    // Walking skeleton returns mock history
    client.send({
      type: 'activity:state',
      data: {
        activities: [
          { timestamp: Date.now() - 3_600_000, app: 'VS Code', description: 'Editing airi-brain', durationMs: 1_800_000 },
          { timestamp: Date.now() - 1_800_000, app: 'Browser', description: 'Reading documentation', durationMs: 900_000 },
        ],
      },
    })
  })
}
