import type { FileChangeEvent, FolderMonitorOptions } from '../types'

import { extname } from 'node:path'

interface Subscription {
  unsubscribe: () => Promise<void>
}

/**
 * Monitors directories for file changes using @parcel/watcher.
 * Imperative Shell — wraps the native file system watcher.
 */
export class FolderMonitor {
  private readonly watchPaths: readonly string[]
  private readonly extensions: Set<string> | null
  private readonly onChange: (event: FileChangeEvent) => void
  private readonly onError: (error: Error) => void
  private subscriptions: Subscription[] = []

  constructor(options: FolderMonitorOptions) {
    if (options.watchPaths.length === 0) {
      throw new Error('watchPaths must contain at least one directory')
    }
    this.watchPaths = [...options.watchPaths]
    this.extensions = options.extensions && options.extensions.length > 0
      ? new Set(options.extensions.map(e => e.startsWith('.') ? e.toLowerCase() : `.${e.toLowerCase()}`))
      : null
    this.onChange = options.onChange
    this.onError = options.onError
  }

  /**
   * Start watching all configured directories.
   * Idempotent — calling start() when already running is a no-op.
   */
  async start(): Promise<void> {
    if (this.subscriptions.length > 0) {
      return
    }

    const watcher = await import('@parcel/watcher')

    for (const dir of this.watchPaths) {
      try {
        const sub = await watcher.subscribe(dir, (err, events) => {
          if (err) {
            this.onError(new Error(`Watcher error for ${dir}`, { cause: err }))
            return
          }

          for (const event of events) {
            if (this.extensions !== null) {
              const ext = extname(event.path).toLowerCase()
              if (!this.extensions.has(ext)) {
                continue
              }
            }

            try {
              this.onChange({
                filePath: event.path,
                type: event.type,
              })
            }
            catch (callbackError) {
              this.onError(new Error(`FolderMonitor onChange callback failed for ${event.path} (${event.type})`, { cause: callbackError }))
            }
          }
        })
        this.subscriptions.push(sub)
      }
      catch (error) {
        this.onError(new Error(`Failed to watch directory: ${dir}`, { cause: error }))
      }
    }

    if (this.subscriptions.length === 0) {
      throw new Error(`Failed to watch any directory out of ${this.watchPaths.length} configured paths`)
    }
  }

  /**
   * Stop all directory watchers.
   */
  async stop(): Promise<void> {
    const subs = this.subscriptions
    this.subscriptions = []

    for (const sub of subs) {
      try {
        await sub.unsubscribe()
      }
      catch (error) {
        this.onError(new Error('Failed to unsubscribe watcher', { cause: error }))
      }
    }
  }

  get isRunning(): boolean {
    return this.subscriptions.length > 0
  }
}
