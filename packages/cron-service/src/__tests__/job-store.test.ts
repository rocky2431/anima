import type { CronJobRecord } from '../cron-types'

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { JobStore } from '../job-store'

function makeJob(overrides: Partial<CronJobRecord> = {}): CronJobRecord {
  return {
    id: 'test-job-1',
    name: 'Test Job',
    mode: 'cron',
    schedule: '*/5 * * * *',
    handler: 'test-handler',
    payload: null,
    timezone: null,
    enabled: true,
    createdAt: '2026-02-19T00:00:00.000Z',
    lastRunAt: null,
    runCount: 0,
    ...overrides,
  }
}

describe('jobStore', () => {
  let tmpDir: string
  let dbPath: string
  let store: JobStore

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cron-service-test-'))
    dbPath = path.join(tmpDir, 'cron.db')
    store = new JobStore(dbPath)
  })

  afterEach(() => {
    store.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('saves and retrieves a job', () => {
    const job = makeJob()
    store.save(job)

    const retrieved = store.get('test-job-1')
    expect(retrieved).toBeDefined()
    expect(retrieved!.id).toBe('test-job-1')
    expect(retrieved!.name).toBe('Test Job')
    expect(retrieved!.mode).toBe('cron')
    expect(retrieved!.schedule).toBe('*/5 * * * *')
    expect(retrieved!.handler).toBe('test-handler')
    expect(retrieved!.enabled).toBe(true)
    expect(retrieved!.runCount).toBe(0)
  })

  it('returns undefined for non-existent job', () => {
    expect(store.get('nonexistent')).toBeUndefined()
  })

  it('lists all jobs ordered by creation time', () => {
    store.save(makeJob({ id: 'job-1', name: 'Job 1', createdAt: '2026-01-01T00:00:00.000Z' }))
    store.save(makeJob({ id: 'job-2', name: 'Job 2', createdAt: '2026-01-02T00:00:00.000Z' }))
    store.save(makeJob({ id: 'job-3', name: 'Job 3', createdAt: '2026-01-03T00:00:00.000Z' }))

    const jobs = store.list()
    expect(jobs).toHaveLength(3)
    expect(jobs.map(j => j.id)).toEqual(['job-1', 'job-2', 'job-3'])
  })

  it('removes a job', () => {
    store.save(makeJob())
    expect(store.get('test-job-1')).toBeDefined()

    const removed = store.remove('test-job-1')
    expect(removed).toBe(true)
    expect(store.get('test-job-1')).toBeUndefined()
  })

  it('returns false when removing non-existent job', () => {
    expect(store.remove('nonexistent')).toBe(false)
  })

  it('atomically increments run count', () => {
    store.save(makeJob())

    store.incrementRunCount('test-job-1', '2026-02-19T12:00:00.000Z')
    const job1 = store.get('test-job-1')!
    expect(job1.lastRunAt).toBe('2026-02-19T12:00:00.000Z')
    expect(job1.runCount).toBe(1)

    store.incrementRunCount('test-job-1', '2026-02-19T13:00:00.000Z')
    const job2 = store.get('test-job-1')!
    expect(job2.runCount).toBe(2)
  })

  it('upserts on duplicate id', () => {
    store.save(makeJob({ name: 'Original' }))
    store.save(makeJob({ name: 'Updated' }))

    const job = store.get('test-job-1')!
    expect(job.name).toBe('Updated')
    expect(store.list()).toHaveLength(1)
  })

  it('persists across reopens', () => {
    store.save(makeJob())
    store.close()

    store = new JobStore(dbPath)
    const job = store.get('test-job-1')
    expect(job).toBeDefined()
    expect(job!.name).toBe('Test Job')
  })

  it('stores and retrieves payload', () => {
    store.save(makeJob({ payload: '{"key":"value","num":42}' }))

    const job = store.get('test-job-1')!
    expect(job.payload).toBe('{"key":"value","num":42}')
  })

  it('handles all three schedule modes', () => {
    store.save(makeJob({ id: 'at-job', mode: 'at', schedule: '2026-06-15T14:30:00.000Z' }))
    store.save(makeJob({ id: 'every-job', mode: 'every', schedule: '30' }))
    store.save(makeJob({ id: 'cron-job', mode: 'cron', schedule: '*/5 * * * *' }))

    expect(store.get('at-job')!.mode).toBe('at')
    expect(store.get('at-job')!.schedule).toBe('2026-06-15T14:30:00.000Z')
    expect(store.get('every-job')!.mode).toBe('every')
    expect(store.get('every-job')!.schedule).toBe('30')
    expect(store.get('cron-job')!.mode).toBe('cron')
    expect(store.get('cron-job')!.schedule).toBe('*/5 * * * *')
  })

  it('handles enabled/disabled state', () => {
    store.save(makeJob({ id: 'disabled', enabled: false }))

    const job = store.get('disabled')!
    expect(job.enabled).toBe(false)
  })
})
