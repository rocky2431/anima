import type { ActivityEvent, ActivityState, ProcessedContext, ProcessedScreenshotContext } from '../types'

import { buildActivityContext } from '../activity/activity-context'

export interface ActivityMonitorOptions {
  /** Interval between aggregation ticks in milliseconds (default: 15 minutes) */
  aggregationIntervalMs?: number
  /** Time without events before user is considered inactive (default: 5 minutes) */
  inactivityThresholdMs?: number
  /** Maximum number of recent apps to track (default: 10) */
  maxRecentApps?: number
  /** How long to retain events in the sliding window (default: 30 minutes) */
  eventRetentionMs?: number
  /** Callback when a new ProcessedContext is produced */
  onContext?: (context: ProcessedContext) => void
  /** Callback when an error occurs during tick */
  onError?: (error: Error) => void
}

const DEFAULT_AGGREGATION_INTERVAL_MS = 15 * 60 * 1000
const DEFAULT_INACTIVITY_THRESHOLD_MS = 5 * 60 * 1000
const DEFAULT_MAX_RECENT_APPS = 10
const DEFAULT_EVENT_RETENTION_MS = 30 * 60 * 1000

/**
 * Monitors user activity by collecting ActivityEvents, aggregating them
 * into ActivityState on a configurable interval, and emitting ProcessedContext
 * via the onContext callback.
 *
 * Lifecycle: construct → recordEvent() to feed data → start() to begin
 * periodic ticking → stop() to halt. Manual tick() is available for testing.
 *
 * Each tick clears the screenshot context after inclusion in the output,
 * so screenshot data is only emitted once per tick cycle.
 */
export class ActivityMonitor {
  private events: ActivityEvent[] = []
  private timer: ReturnType<typeof setInterval> | null = null
  private ticking = false
  private screenshotContext: ProcessedScreenshotContext | undefined
  private readonly aggregationIntervalMs: number
  private readonly inactivityThresholdMs: number
  private readonly maxRecentApps: number
  private readonly eventRetentionMs: number
  private readonly onContext?: (context: ProcessedContext) => void
  private readonly onError?: (error: Error) => void

  constructor(options: ActivityMonitorOptions) {
    this.aggregationIntervalMs = options.aggregationIntervalMs ?? DEFAULT_AGGREGATION_INTERVAL_MS
    this.inactivityThresholdMs = options.inactivityThresholdMs ?? DEFAULT_INACTIVITY_THRESHOLD_MS
    this.maxRecentApps = options.maxRecentApps ?? DEFAULT_MAX_RECENT_APPS
    this.eventRetentionMs = options.eventRetentionMs ?? DEFAULT_EVENT_RETENTION_MS
    this.onContext = options.onContext
    this.onError = options.onError
  }

  recordEvent(event: ActivityEvent): void {
    this.events.push(event)
    this.trimEvents()
  }

  setScreenshotContext(context: ProcessedScreenshotContext): void {
    this.screenshotContext = context
  }

  getState(): ActivityState {
    if (this.events.length === 0) {
      return {
        currentApp: '',
        currentWindowTitle: '',
        isActive: false,
        continuousWorkDurationMs: 0,
        recentApps: [],
        lastActivityTimestamp: 0,
        isFullscreen: false,
      }
    }

    const activityContext = buildActivityContext(this.events)
    const now = Date.now()
    const timeSinceLastActivity = now - activityContext.lastActivityTimestamp
    const isActive = timeSinceLastActivity < this.inactivityThresholdMs

    return {
      currentApp: activityContext.currentApp,
      currentWindowTitle: activityContext.currentWindowTitle,
      isActive,
      continuousWorkDurationMs: activityContext.continuousWorkDurationMs,
      recentApps: this.buildRecentApps(),
      lastActivityTimestamp: activityContext.lastActivityTimestamp,
      isFullscreen: activityContext.isFullscreen,
    }
  }

  /**
   * Aggregate current state into a ProcessedContext and emit via onContext.
   * Clears screenshot context after inclusion. Errors from onContext are
   * forwarded to onError; if onError is not set, the error is re-thrown.
   */
  tick(): ProcessedContext {
    if (this.ticking) {
      return { activity: this.getState(), timestamp: Date.now() }
    }

    this.ticking = true
    try {
      const state = this.getState()
      const now = Date.now()
      const context: ProcessedContext = {
        activity: state,
        screenshot: this.screenshotContext,
        timestamp: now,
      }

      this.screenshotContext = undefined

      try {
        this.onContext?.(context)
      }
      catch (cause) {
        const error = new Error('ActivityMonitor tick failed', { cause })
        if (this.onError) {
          this.onError(error)
        }
        else {
          throw error
        }
      }

      return context
    }
    finally {
      this.ticking = false
    }
  }

  start(): void {
    if (this.timer !== null) {
      return
    }
    this.timer = setInterval(() => this.tick(), this.aggregationIntervalMs)
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  get isRunning(): boolean {
    return this.timer !== null
  }

  private trimEvents(): void {
    const now = Date.now()
    const cutoff = now - this.eventRetentionMs
    this.events = this.events.filter(e => e.timestamp >= cutoff)
  }

  private buildRecentApps(): string[] {
    const seen = new Set<string>()
    const result: string[] = []

    for (let i = this.events.length - 1; i >= 0 && result.length < this.maxRecentApps; i--) {
      const app = this.events[i].appName
      if (seen.has(app))
        continue
      seen.add(app)
      result.push(app)
    }

    return result
  }
}
