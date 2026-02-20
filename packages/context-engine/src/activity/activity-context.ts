import type { ActivityContext, ActivityEvent } from '../types'

import { calculateContinuousWorkDuration } from './duration'

/**
 * Build an aggregated ActivityContext from a series of events.
 *
 * @param events - Sorted array of activity events (ascending by timestamp)
 * @param gapThresholdMs - Maximum gap between events to consider them continuous
 * @returns Aggregated activity context
 */
export function buildActivityContext(
  events: ActivityEvent[],
  gapThresholdMs: number = 5 * 60 * 1000,
): ActivityContext {
  if (events.length === 0) {
    return {
      continuousWorkDurationMs: 0,
      currentApp: '',
      currentWindowTitle: '',
      isFullscreen: false,
      lastActivityTimestamp: 0,
    }
  }

  const lastEvent = events[events.length - 1]

  return {
    continuousWorkDurationMs: calculateContinuousWorkDuration(events, gapThresholdMs),
    currentApp: lastEvent.appName,
    currentWindowTitle: lastEvent.windowTitle,
    isFullscreen: lastEvent.isFullscreen,
    lastActivityTimestamp: lastEvent.timestamp,
  }
}
