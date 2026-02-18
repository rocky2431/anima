export type ScheduleMode = 'at' | 'every' | 'cron'

export const VALID_MODES: readonly ScheduleMode[] = ['at', 'every', 'cron']

export interface CronJobRecord {
  readonly id: string
  readonly name: string
  readonly mode: ScheduleMode
  readonly schedule: string
  readonly handler: string
  readonly payload: string | null
  readonly timezone: string | null
  readonly enabled: boolean
  readonly createdAt: string
  readonly lastRunAt: string | null
  readonly runCount: number
}

export interface ScheduleOptions {
  name: string
  handler: string
  payload?: Record<string, unknown>
  timezone?: string
}

export interface CronServiceOptions {
  onError?: (error: Error) => void
}

export type JobHandler = (job: CronJobRecord) => void | Promise<void>
