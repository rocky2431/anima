import type { FileChangeEvent } from '../types'

import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { FolderMonitor } from '../capture/folder-monitor'

/**
 * Helper to wait for a condition with timeout.
 */
function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const check = () => {
      if (predicate()) {
        resolve()
        return
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`waitFor timed out after ${timeoutMs}ms`))
        return
      }
      setTimeout(check, 100)
    }
    check()
  })
}

describe('folderMonitor', () => {
  let tmpDir: string
  let monitor: FolderMonitor | null

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'foldermon-test-'))
    monitor = null
  })

  afterEach(async () => {
    if (monitor?.isRunning) {
      await monitor.stop()
    }
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('calls onChange when a file is created', async () => {
    const events: FileChangeEvent[] = []
    const errors: Error[] = []

    monitor = new FolderMonitor({
      watchPaths: [tmpDir],
      onChange: event => events.push(event),
      onError: error => errors.push(error),
    })

    await monitor.start()
    expect(monitor.isRunning).toBe(true)

    // Create a file — the watcher should detect it
    const filePath = join(tmpDir, 'newfile.txt')
    await writeFile(filePath, 'hello')

    await waitFor(() => events.length > 0)

    expect(events.length).toBeGreaterThanOrEqual(1)
    const createEvent = events.find(e => e.filePath.endsWith('newfile.txt'))
    expect(createEvent).toBeDefined()
    expect(createEvent!.type).toBe('create')
    expect(errors).toHaveLength(0)
  })

  it('calls onChange when a file is modified', async () => {
    // Pre-create file well before starting the monitor
    const filePath = join(tmpDir, 'existing.txt')
    await writeFile(filePath, 'original')
    // Let the file system settle so the watcher treats the next write as 'update'
    await new Promise(resolve => setTimeout(resolve, 500))

    const events: FileChangeEvent[] = []
    monitor = new FolderMonitor({
      watchPaths: [tmpDir],
      onChange: event => events.push(event),
      onError: () => {},
    })

    await monitor.start()
    // Small delay to let the watcher fully initialize
    await new Promise(resolve => setTimeout(resolve, 200))

    // Modify the existing file
    await writeFile(filePath, 'modified content')

    await waitFor(() => events.length > 0)

    const fileEvent = events.find(e => e.filePath.endsWith('existing.txt'))
    expect(fileEvent).toBeDefined()
    // @parcel/watcher may report 'create' or 'update' depending on FS timing
    expect(['create', 'update']).toContain(fileEvent!.type)
  })

  it('filters by extension when configured', async () => {
    const events: FileChangeEvent[] = []

    monitor = new FolderMonitor({
      watchPaths: [tmpDir],
      extensions: ['.txt'],
      onChange: event => events.push(event),
      onError: () => {},
    })

    await monitor.start()

    // Create a .txt file (should be captured) and a .log file (should be filtered)
    await writeFile(join(tmpDir, 'included.txt'), 'hello')
    await writeFile(join(tmpDir, 'excluded.log'), 'world')

    // Wait for the .txt event
    await waitFor(() => events.some(e => e.filePath.endsWith('.txt')))

    // Give a little extra time for any .log events to arrive
    await new Promise(resolve => setTimeout(resolve, 500))

    const txtEvents = events.filter(e => e.filePath.endsWith('.txt'))
    const logEvents = events.filter(e => e.filePath.endsWith('.log'))
    expect(txtEvents.length).toBeGreaterThanOrEqual(1)
    expect(logEvents).toHaveLength(0)
  })

  it('watches multiple directories', async () => {
    const dir2 = join(tmpDir, 'subdir')
    mkdirSync(dir2)

    const events: FileChangeEvent[] = []

    monitor = new FolderMonitor({
      watchPaths: [tmpDir, dir2],
      onChange: event => events.push(event),
      onError: () => {},
    })

    await monitor.start()

    await writeFile(join(tmpDir, 'file1.txt'), 'one')
    await writeFile(join(dir2, 'file2.txt'), 'two')

    await waitFor(() => events.length >= 2)

    const paths = events.map(e => e.filePath)
    expect(paths.some(p => p.includes('file1.txt'))).toBe(true)
    expect(paths.some(p => p.includes('file2.txt'))).toBe(true)
  })

  it('does not emit events after stop', async () => {
    const events: FileChangeEvent[] = []

    monitor = new FolderMonitor({
      watchPaths: [tmpDir],
      onChange: event => events.push(event),
      onError: () => {},
    })

    await monitor.start()
    await monitor.stop()
    expect(monitor.isRunning).toBe(false)

    // Create a file after stopping — should NOT trigger callback
    await writeFile(join(tmpDir, 'after-stop.txt'), 'ignored')
    await new Promise(resolve => setTimeout(resolve, 1000))

    expect(events).toHaveLength(0)
  })

  it('is idempotent on start/stop', async () => {
    monitor = new FolderMonitor({
      watchPaths: [tmpDir],
      onChange: () => {},
      onError: () => {},
    })

    await monitor.start()
    await monitor.start() // second start should be no-op
    expect(monitor.isRunning).toBe(true)

    await monitor.stop()
    await monitor.stop() // second stop should be no-op
    expect(monitor.isRunning).toBe(false)
  })

  it('throws for empty watchPaths', () => {
    expect(() => new FolderMonitor({
      watchPaths: [],
      onChange: () => {},
      onError: () => {},
    })).toThrow('watchPaths must contain at least one directory')
  })
})
