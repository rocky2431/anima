import type { ActivityEvent } from '../types'

/**
 * Calculate the duration of continuous work from a series of activity events.
 * Events are considered "continuous" if the gap between consecutive events
 * is less than the specified threshold.
 *
 * @param events - Sorted array of activity events (ascending by timestamp)
 * @param gapThresholdMs - Maximum gap between events to consider them continuous (default: 5 minutes)
 * @returns Duration of the last continuous work segment in milliseconds
 */
export function calculateContinuousWorkDuration(
  events: ActivityEvent[],
  gapThresholdMs: number = 5 * 60 * 1000,
): number {
  if (events.length <= 1) {
    return 0
  }

  let segmentStart = events[0].timestamp

  for (let i = 1; i < events.length; i++) {
    const gap = events[i].timestamp - events[i - 1].timestamp
    if (gap > gapThresholdMs) {
      segmentStart = events[i].timestamp
    }
  }

  const lastTimestamp = events[events.length - 1].timestamp
  return lastTimestamp - segmentStart
}
