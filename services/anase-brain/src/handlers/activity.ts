import type { Client } from '@anase/server-sdk'

import type { BrainStore } from '../store'

import { useLogg } from '@guiiai/logg'

const log = useLogg('brain:activity').useGlobalConfig()

/**
 * Activity handler — serves real persisted activity data.
 * Activity events are written by the desktop-shell integration or
 * other context-engine consumers. This handler reads and broadcasts.
 */
export function registerActivityHandler(client: Client, brainStore: BrainStore): void {
  // Push the current day's summary if available
  setTimeout(() => {
    const today = new Date().toISOString().slice(0, 10)
    const summary = brainStore.getActivitySummary(today)

    if (summary) {
      client.send({
        type: 'activity:summary',
        data: {
          date: summary.date,
          highlights: summary.highlights,
          activityBreakdown: summary.breakdown,
          totalWorkDurationMs: summary.totalWorkDurationMs,
          personalNote: '',
        },
      })
      log.log('Pushed existing activity summary', { date: today })
    }
    else {
      log.log('No activity summary for today yet', { date: today })
    }
  }, 2000)

  client.onEvent('activity:history:request', (event) => {
    const { date, limit = 50 } = event.data as { date?: string, limit?: number }
    log.log('Activity history request', { date, limit })

    const events = brainStore.getActivityEvents({ date, limit })

    client.send({
      type: 'activity:state',
      data: {
        activities: events.map(e => ({
          timestamp: e.timestamp,
          app: e.appName,
          description: e.description,
          durationMs: e.durationMs,
        })),
      },
    })
  })
}
