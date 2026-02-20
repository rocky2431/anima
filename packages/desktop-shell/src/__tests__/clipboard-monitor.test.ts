import type { ClipboardChange } from '../types'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ClipboardMonitor } from '../clipboard-monitor'

function noop() {}

describe('clipboardMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('change detection', () => {
    it('fires onChange when clipboard text changes', () => {
      const changes: ClipboardChange[] = []
      let clipboardText = 'initial'
      const monitor = new ClipboardMonitor({
        pollIntervalMs: 100,
        readClipboard: () => clipboardText,
        onChange: change => changes.push(change),
        onError: noop,
      })

      monitor.start()
      clipboardText = 'updated'
      vi.advanceTimersByTime(100)

      expect(changes).toHaveLength(1)
      expect(changes[0].text).toBe('updated')
      expect(changes[0].previousText).toBe('initial')

      monitor.stop()
    })

    it('does not fire onChange when clipboard text is unchanged', () => {
      const changes: ClipboardChange[] = []
      const monitor = new ClipboardMonitor({
        pollIntervalMs: 100,
        readClipboard: () => 'same text',
        onChange: change => changes.push(change),
        onError: noop,
      })

      monitor.start()
      vi.advanceTimersByTime(500)

      expect(changes).toHaveLength(0)

      monitor.stop()
    })

    it('detects multiple consecutive changes', () => {
      const changes: ClipboardChange[] = []
      let clipboardText = 'first'
      const monitor = new ClipboardMonitor({
        pollIntervalMs: 100,
        readClipboard: () => clipboardText,
        onChange: change => changes.push(change),
        onError: noop,
      })

      monitor.start()

      clipboardText = 'second'
      vi.advanceTimersByTime(100)

      clipboardText = 'third'
      vi.advanceTimersByTime(100)

      expect(changes).toHaveLength(2)
      expect(changes[0].text).toBe('second')
      expect(changes[0].previousText).toBe('first')
      expect(changes[1].text).toBe('third')
      expect(changes[1].previousText).toBe('second')

      monitor.stop()
    })

    it('includes timestamp in change events', () => {
      const changes: ClipboardChange[] = []
      let clipboardText = 'initial'
      const now = Date.now()
      vi.setSystemTime(now)

      const monitor = new ClipboardMonitor({
        pollIntervalMs: 100,
        readClipboard: () => clipboardText,
        onChange: change => changes.push(change),
        onError: noop,
      })

      monitor.start()
      clipboardText = 'changed'
      vi.advanceTimersByTime(100)

      expect(changes[0].timestamp).toBe(now + 100)

      monitor.stop()
    })
  })

  describe('lifecycle', () => {
    it('starts and stops polling', () => {
      const monitor = new ClipboardMonitor({
        readClipboard: () => '',
        onChange: noop,
        onError: noop,
      })

      expect(monitor.isRunning).toBe(false)

      monitor.start()
      expect(monitor.isRunning).toBe(true)

      monitor.stop()
      expect(monitor.isRunning).toBe(false)
    })

    it('is idempotent on double start', () => {
      const changes: ClipboardChange[] = []
      let clipboardText = 'initial'
      const monitor = new ClipboardMonitor({
        pollIntervalMs: 100,
        readClipboard: () => clipboardText,
        onChange: change => changes.push(change),
        onError: noop,
      })

      monitor.start()
      monitor.start()

      clipboardText = 'changed'
      vi.advanceTimersByTime(100)

      expect(changes).toHaveLength(1)

      monitor.stop()
    })

    it('stops polling after stop()', () => {
      const changes: ClipboardChange[] = []
      let clipboardText = 'initial'
      const monitor = new ClipboardMonitor({
        pollIntervalMs: 100,
        readClipboard: () => clipboardText,
        onChange: change => changes.push(change),
        onError: noop,
      })

      monitor.start()
      clipboardText = 'changed'
      vi.advanceTimersByTime(100)
      expect(changes).toHaveLength(1)

      monitor.stop()
      clipboardText = 'another change'
      vi.advanceTimersByTime(500)
      expect(changes).toHaveLength(1)
    })

    it('stop is safe to call when not running', () => {
      const monitor = new ClipboardMonitor({
        readClipboard: () => '',
        onChange: noop,
        onError: noop,
      })

      expect(() => monitor.stop()).not.toThrow()
    })
  })

  describe('error handling', () => {
    it('reports readClipboard errors via onError during polling', () => {
      const errors: Error[] = []
      let shouldThrow = false
      const monitor = new ClipboardMonitor({
        pollIntervalMs: 100,
        readClipboard: () => {
          if (shouldThrow)
            throw new Error('clipboard read failed')
          return 'ok'
        },
        onChange: noop,
        onError: err => errors.push(err),
      })

      monitor.start()
      shouldThrow = true
      vi.advanceTimersByTime(100)

      expect(errors).toHaveLength(1)
      expect(errors[0].message).toBe('ClipboardMonitor poll failed')
      expect(errors[0].cause).toBeInstanceOf(Error)

      monitor.stop()
    })

    it('reports initial readClipboard error via onError and does not start', () => {
      const errors: Error[] = []
      const monitor = new ClipboardMonitor({
        readClipboard: () => { throw new Error('no access') },
        onChange: noop,
        onError: err => errors.push(err),
      })

      monitor.start()

      expect(errors).toHaveLength(1)
      expect(errors[0].message).toBe('ClipboardMonitor failed to read initial clipboard state')
      expect(monitor.isRunning).toBe(false)
    })

    it('reports onChange callback errors separately from read errors', () => {
      const errors: Error[] = []
      let clipboardText = 'initial'
      const monitor = new ClipboardMonitor({
        pollIntervalMs: 100,
        readClipboard: () => clipboardText,
        onChange: () => { throw new Error('callback boom') },
        onError: err => errors.push(err),
      })

      monitor.start()
      clipboardText = 'changed'
      vi.advanceTimersByTime(100)

      expect(errors).toHaveLength(1)
      expect(errors[0].message).toBe('ClipboardMonitor onChange callback failed')
      expect(errors[0].cause).toBeInstanceOf(Error)

      monitor.stop()
    })
  })

  describe('constructor validation', () => {
    it('throws for zero pollIntervalMs', () => {
      expect(() => new ClipboardMonitor({
        pollIntervalMs: 0,
        readClipboard: () => '',
        onChange: noop,
        onError: noop,
      })).toThrow('pollIntervalMs must be a positive number')
    })

    it('throws for negative pollIntervalMs', () => {
      expect(() => new ClipboardMonitor({
        pollIntervalMs: -100,
        readClipboard: () => '',
        onChange: noop,
        onError: noop,
      })).toThrow('pollIntervalMs must be a positive number')
    })
  })

  describe('default poll interval', () => {
    it('uses 1000ms default poll interval', () => {
      const changes: ClipboardChange[] = []
      let clipboardText = 'initial'
      const monitor = new ClipboardMonitor({
        readClipboard: () => clipboardText,
        onChange: change => changes.push(change),
        onError: noop,
      })

      monitor.start()
      clipboardText = 'changed'

      vi.advanceTimersByTime(999)
      expect(changes).toHaveLength(0)

      vi.advanceTimersByTime(1)
      expect(changes).toHaveLength(1)

      monitor.stop()
    })
  })
})
