import type { ClipboardMonitorOptions } from './types'

const DEFAULT_POLL_INTERVAL_MS = 1000

/** Poll-based clipboard change detector. Requires a readClipboard function (e.g. Electron clipboard.readText). */
export class ClipboardMonitor {
  private readonly pollIntervalMs: number
  private readonly readClipboard: () => string
  private readonly onChange: ClipboardMonitorOptions['onChange']
  private readonly onError: (error: Error) => void
  private lastText: string
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(options: ClipboardMonitorOptions) {
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
    if (this.pollIntervalMs <= 0) {
      throw new Error('pollIntervalMs must be a positive number')
    }
    this.readClipboard = options.readClipboard
    this.onChange = options.onChange
    this.onError = options.onError
    this.lastText = ''
  }

  /** Start polling. Idempotent — no-op if already running. Reads clipboard once immediately. */
  start(): void {
    if (this.timer !== null) {
      return
    }

    try {
      this.lastText = this.readClipboard()
    }
    catch (err) {
      this.onError(new Error('ClipboardMonitor failed to read initial clipboard state', { cause: err }))
      return
    }
    this.timer = setInterval(() => this.poll(), this.pollIntervalMs)
  }

  /** Stop polling. Safe to call when not running. */
  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  get isRunning(): boolean {
    return this.timer !== null
  }

  private poll(): void {
    let current: string
    try {
      current = this.readClipboard()
    }
    catch (err) {
      this.onError(new Error('ClipboardMonitor poll failed', { cause: err }))
      return
    }

    if (current !== this.lastText) {
      const previous = this.lastText
      this.lastText = current
      try {
        this.onChange({
          text: current,
          previousText: previous,
          timestamp: Date.now(),
        })
      }
      catch (err) {
        this.onError(new Error('ClipboardMonitor onChange callback failed', { cause: err }))
      }
    }
  }
}
