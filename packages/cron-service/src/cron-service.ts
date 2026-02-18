import type { CronJobRecord, CronServiceOptions, JobHandler, ScheduleOptions } from './cron-types'

import { Cron } from 'croner'
import { nanoid } from 'nanoid'

import { JobStore } from './job-store'

export class CronService {
  private store: JobStore
  private handlers = new Map<string, JobHandler>()
  private activeJobs = new Map<string, Cron>()
  private onError: (error: Error) => void

  constructor(dbPath: string, options?: CronServiceOptions) {
    this.store = new JobStore(dbPath)
    this.onError = options?.onError ?? (() => {})
  }

  registerHandler(name: string, fn: JobHandler): void {
    this.handlers.set(name, fn)
  }

  at(date: Date | string, options: ScheduleOptions): string {
    this.validateOptions(options)
    const isoDate = date instanceof Date ? date.toISOString() : date
    if (Number.isNaN(new Date(isoDate).getTime())) {
      throw new TypeError(`Invalid date: '${isoDate}'`)
    }

    return this.createJob('at', isoDate, options)
  }

  every(intervalSeconds: number, options: ScheduleOptions): string {
    this.validateOptions(options)
    if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
      throw new Error(`intervalSeconds must be a positive finite number, got: ${intervalSeconds}`)
    }

    return this.createJob('every', String(intervalSeconds), options)
  }

  cron(expression: string, options: ScheduleOptions): string {
    this.validateOptions(options)
    if (!expression || expression.trim() === '') {
      throw new Error('Cron expression must not be empty')
    }

    return this.createJob('cron', expression, options)
  }

  remove(jobId: string): boolean {
    const cronJob = this.activeJobs.get(jobId)
    if (cronJob) {
      cronJob.stop()
      this.activeJobs.delete(jobId)
    }
    return this.store.remove(jobId)
  }

  pause(jobId: string): boolean {
    const cronJob = this.activeJobs.get(jobId)
    if (cronJob) {
      return cronJob.pause()
    }
    return false
  }

  resume(jobId: string): boolean {
    const cronJob = this.activeJobs.get(jobId)
    if (cronJob) {
      return cronJob.resume()
    }
    return false
  }

  get(jobId: string): CronJobRecord | undefined {
    return this.store.get(jobId)
  }

  list(): CronJobRecord[] {
    return this.store.list()
  }

  start(): void {
    const jobs = this.store.list()
    for (const job of jobs) {
      if (!job.enabled)
        continue
      if (job.mode === 'at' && new Date(job.schedule) <= new Date())
        continue
      try {
        this.scheduleJob(job)
      }
      catch (err) {
        this.onError(
          new Error(`Failed to restore job '${job.name}' (${job.id})`, { cause: err }),
        )
      }
    }
  }

  stop(): void {
    for (const [, cronJob] of this.activeJobs) {
      cronJob.stop()
    }
    this.activeJobs.clear()
  }

  close(): void {
    try {
      this.stop()
    }
    finally {
      this.store.close()
    }
  }

  private validateOptions(options: ScheduleOptions): void {
    if (!options.handler || options.handler.trim() === '') {
      throw new Error('Handler name must not be empty')
    }
    if (!this.handlers.has(options.handler)) {
      throw new Error(
        `Handler '${options.handler}' not registered. Call registerHandler() first.`,
      )
    }
    if (!options.name || options.name.trim() === '') {
      throw new Error('Job name must not be empty')
    }
  }

  private createJob(
    mode: CronJobRecord['mode'],
    schedule: string,
    options: ScheduleOptions,
  ): string {
    const id = nanoid()
    const record: CronJobRecord = {
      id,
      name: options.name,
      mode,
      schedule,
      handler: options.handler,
      payload: options.payload ? JSON.stringify(options.payload) : null,
      timezone: options.timezone ?? null,
      enabled: true,
      createdAt: new Date().toISOString(),
      lastRunAt: null,
      runCount: 0,
    }

    this.store.save(record)
    try {
      this.scheduleJob(record)
    }
    catch (err) {
      this.store.remove(id)
      throw new Error(
        `Failed to schedule job '${record.name}' (${mode}: ${schedule})`,
        { cause: err },
      )
    }
    return id
  }

  private scheduleJob(record: CronJobRecord): void {
    const handler = this.handlers.get(record.handler)
    if (!handler)
      return

    const callback = async () => {
      const currentRecord = this.store.get(record.id)
      if (!currentRecord || !currentRecord.enabled)
        return

      try {
        await handler(currentRecord)
        try {
          this.store.incrementRunCount(record.id, new Date().toISOString())
        }
        catch (dbErr) {
          this.onError(
            new Error(`Failed to update run metadata for job '${record.id}'`, { cause: dbErr }),
          )
        }
      }
      catch (handlerErr) {
        this.onError(
          new Error(
            `Job '${record.name}' (${record.id}) handler '${record.handler}' failed`,
            { cause: handlerErr },
          ),
        )
      }
    }

    const cronOptions: Record<string, unknown> = {}
    if (record.timezone) {
      cronOptions.timezone = record.timezone
    }

    let cronJob: Cron
    switch (record.mode) {
      case 'at':
        cronJob = new Cron(new Date(record.schedule), cronOptions, callback)
        break
      case 'every':
        cronJob = new Cron(
          '* * * * * *',
          { ...cronOptions, interval: Number(record.schedule) },
          callback,
        )
        break
      case 'cron':
        cronJob = new Cron(record.schedule, cronOptions, callback)
        break
    }

    this.activeJobs.set(record.id, cronJob)
  }
}
