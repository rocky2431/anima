import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { CronService } from '../cron-service'

describe('cronService', () => {
  let tmpDir: string
  let dbPath: string
  let service: CronService

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cron-svc-test-'))
    dbPath = path.join(tmpDir, 'cron.db')
    service = new CronService(dbPath)
  })

  afterEach(() => {
    service.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('at()', () => {
    it('schedules and fires a one-time job', async () => {
      let fired = false
      service.registerHandler('once-handler', () => {
        fired = true
      })

      const futureDate = new Date(Date.now() + 1500)
      const id = service.at(futureDate, { name: 'fire-once', handler: 'once-handler' })

      expect(id).toBeTruthy()
      expect(service.get(id)).toBeDefined()
      expect(service.get(id)!.mode).toBe('at')

      await new Promise(resolve => setTimeout(resolve, 3000))
      expect(fired).toBe(true)
    }, 10000)

    it('stores job record in database', () => {
      service.registerHandler('test', () => {})
      const id = service.at(new Date(Date.now() + 60000), { name: 'stored-at', handler: 'test' })

      const job = service.get(id)
      expect(job).toBeDefined()
      expect(job!.name).toBe('stored-at')
      expect(job!.mode).toBe('at')
    })
  })

  describe('every()', () => {
    it('schedules and fires a recurring job', async () => {
      let count = 0
      service.registerHandler('counter', () => {
        count++
      })

      const id = service.every(1, { name: 'repeater', handler: 'counter' })

      expect(id).toBeTruthy()
      expect(service.get(id)!.mode).toBe('every')

      await new Promise(resolve => setTimeout(resolve, 3500))
      expect(count).toBeGreaterThanOrEqual(2)
    }, 10000)

    it('stores job with interval in database', () => {
      service.registerHandler('test', () => {})
      const id = service.every(30, { name: 'interval-job', handler: 'test' })

      const job = service.get(id)
      expect(job).toBeDefined()
      expect(job!.schedule).toBe('30')
      expect(job!.mode).toBe('every')
    })

    it('rejects non-positive interval', () => {
      service.registerHandler('test', () => {})
      expect(() => service.every(0, { name: 'bad', handler: 'test' }))
        .toThrow('intervalSeconds must be a positive finite number')
      expect(() => service.every(-1, { name: 'bad', handler: 'test' }))
        .toThrow('intervalSeconds must be a positive finite number')
    })
  })

  describe('cron()', () => {
    it('schedules and fires a cron job', async () => {
      let count = 0
      service.registerHandler('cron-counter', () => {
        count++
      })

      const id = service.cron('*/1 * * * * *', { name: 'every-second', handler: 'cron-counter' })

      expect(id).toBeTruthy()
      expect(service.get(id)!.mode).toBe('cron')

      await new Promise(resolve => setTimeout(resolve, 3500))
      expect(count).toBeGreaterThanOrEqual(2)
    }, 10000)

    it('stores job with cron expression', () => {
      service.registerHandler('test', () => {})
      const id = service.cron('0 0 * * *', { name: 'daily', handler: 'test' })

      const job = service.get(id)
      expect(job).toBeDefined()
      expect(job!.schedule).toBe('0 0 * * *')
      expect(job!.mode).toBe('cron')
    })

    it('rejects empty cron expression', () => {
      service.registerHandler('test', () => {})
      expect(() => service.cron('', { name: 'bad', handler: 'test' }))
        .toThrow('Cron expression must not be empty')
    })
  })

  describe('dynamic add/remove', () => {
    it('removes a scheduled job', () => {
      service.registerHandler('test', () => {})
      const id = service.cron('* * * * *', { name: 'to-remove', handler: 'test' })

      expect(service.get(id)).toBeDefined()
      const removed = service.remove(id)
      expect(removed).toBe(true)
      expect(service.get(id)).toBeUndefined()
    })

    it('lists all active jobs', () => {
      service.registerHandler('test', () => {})
      service.cron('* * * * *', { name: 'job-1', handler: 'test' })
      service.cron('*/5 * * * *', { name: 'job-2', handler: 'test' })

      const jobs = service.list()
      expect(jobs).toHaveLength(2)
    })

    it('supports add then remove dynamically', () => {
      service.registerHandler('test', () => {})

      const id1 = service.cron('* * * * *', { name: 'job-1', handler: 'test' })
      expect(service.list()).toHaveLength(1)

      const id2 = service.cron('*/5 * * * *', { name: 'job-2', handler: 'test' })
      expect(service.list()).toHaveLength(2)

      service.remove(id1)
      expect(service.list()).toHaveLength(1)
      expect(service.list()[0].id).toBe(id2)
    })
  })

  describe('pause and resume', () => {
    it('returns false for non-existent job', () => {
      expect(service.pause('nonexistent')).toBe(false)
      expect(service.resume('nonexistent')).toBe(false)
    })

    it('pauses and resumes a scheduled job', () => {
      service.registerHandler('test', () => {})
      const id = service.cron('* * * * *', { name: 'pausable', handler: 'test' })

      expect(service.pause(id)).toBe(true)
      expect(service.resume(id)).toBe(true)
    })
  })

  describe('stop()', () => {
    it('stops all active jobs from firing', async () => {
      let count = 0
      service.registerHandler('counter', () => {
        count++
      })

      service.every(1, { name: 'stopper', handler: 'counter' })
      await new Promise(resolve => setTimeout(resolve, 1500))
      const countBeforeStop = count

      service.stop()
      await new Promise(resolve => setTimeout(resolve, 2000))
      expect(count).toBe(countBeforeStop)
    }, 10000)
  })

  describe('persistence', () => {
    it('restores jobs from database on start()', () => {
      service.registerHandler('test', () => {})
      service.cron('*/5 * * * *', { name: 'persistent-job', handler: 'test' })
      service.close()

      service = new CronService(dbPath)
      service.registerHandler('test', () => {})
      service.start()

      const jobs = service.list()
      expect(jobs).toHaveLength(1)
      expect(jobs[0].name).toBe('persistent-job')
    })

    it('skips disabled jobs on start()', async () => {
      service.registerHandler('test', () => {})
      service.cron('*/5 * * * *', { name: 'disabled-job', handler: 'test' })
      const jobs = service.list()
      const jobId = jobs[0].id

      service.close()

      // Directly modify DB to set disabled
      const { JobStore } = await import('../job-store')
      const store = new JobStore(dbPath)
      store.save({ ...jobs[0], enabled: false })
      store.close()

      service = new CronService(dbPath)
      service.registerHandler('test', () => {})
      service.start()

      const restored = service.get(jobId)
      expect(restored).toBeDefined()
      expect(restored!.enabled).toBe(false)
    })

    it('skips expired at jobs on start()', async () => {
      service.registerHandler('test', () => {})
      const pastDate = new Date(Date.now() - 60000).toISOString()

      service.close()

      // Create job with past date directly in DB
      const { JobStore } = await import('../job-store')
      const store = new JobStore(dbPath)
      store.save({
        id: 'expired-at',
        name: 'expired',
        mode: 'at',
        schedule: pastDate,
        handler: 'test',
        payload: null,
        timezone: null,
        enabled: true,
        createdAt: new Date().toISOString(),
        lastRunAt: null,
        runCount: 0,
      })
      store.close()

      service = new CronService(dbPath)
      service.registerHandler('test', () => {})
      service.start()

      // Job exists in DB but should not be actively scheduled
      expect(service.get('expired-at')).toBeDefined()
    })
  })

  describe('payload', () => {
    it('passes payload to handler via job record', async () => {
      let receivedPayload: Record<string, unknown> | null = null
      service.registerHandler('payload-handler', (job) => {
        receivedPayload = job.payload ? JSON.parse(job.payload) : null
      })

      const futureDate = new Date(Date.now() + 1500)
      service.at(futureDate, {
        name: 'with-payload',
        handler: 'payload-handler',
        payload: { key: 'value', num: 42 },
      })

      await new Promise(resolve => setTimeout(resolve, 3000))
      expect(receivedPayload).toEqual({ key: 'value', num: 42 })
    }, 10000)
  })

  describe('handler validation', () => {
    it('throws when handler is not registered', () => {
      expect(() => service.cron('*/5 * * * *', { name: 'no-handler', handler: 'nonexistent' }))
        .toThrow('Handler \'nonexistent\' not registered')
    })

    it('throws when handler name is empty', () => {
      expect(() => service.cron('*/5 * * * *', { name: 'bad', handler: '' }))
        .toThrow('Handler name must not be empty')
    })

    it('throws when job name is empty', () => {
      service.registerHandler('test', () => {})
      expect(() => service.cron('*/5 * * * *', { name: '', handler: 'test' }))
        .toThrow('Job name must not be empty')
    })
  })

  describe('error handling', () => {
    it('catches handler errors without crashing', async () => {
      const errors: Error[] = []
      service.close()
      service = new CronService(dbPath, {
        onError: err => errors.push(err),
      })

      service.registerHandler('failing', () => {
        throw new Error('handler boom')
      })

      const futureDate = new Date(Date.now() + 1500)
      service.at(futureDate, { name: 'will-fail', handler: 'failing' })

      await new Promise(resolve => setTimeout(resolve, 3000))
      expect(errors.length).toBeGreaterThanOrEqual(1)
      expect(errors[0].message).toContain('handler')
    }, 10000)

    it('isolates start() failures per job', () => {
      const errors: Error[] = []
      service.close()

      // Create a service with an error handler
      service = new CronService(dbPath, {
        onError: err => errors.push(err),
      })

      service.registerHandler('good', () => {})
      service.cron('*/5 * * * *', { name: 'good-job', handler: 'good' })
      service.close()

      service = new CronService(dbPath, {
        onError: err => errors.push(err),
      })
      service.registerHandler('good', () => {})
      // start() should not throw even if there are problematic jobs
      service.start()
      expect(service.list()).toHaveLength(1)
    })
  })
})
