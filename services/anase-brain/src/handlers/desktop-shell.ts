import type { Client } from '@anase/server-sdk'

import type { BrainStore } from '../store'

import { platform } from 'node:process'

import { useLogg } from '@guiiai/logg'
import { getActiveWindow } from '@anase/desktop-shell'
import { nanoid } from 'nanoid'

const log = useLogg('brain:desktop-shell').useGlobalConfig()

const WINDOW_POLL_INTERVAL_MS = 10_000

let pollTimer: ReturnType<typeof setInterval> | null = null
let lastAppName = ''
let lastWindowTitle = ''
let lastSwitchTime = Date.now()
let lastEventId = ''

/**
 * Register desktop-shell handler for anase-brain.
 *
 * Polls the active window on macOS every 10s, records transitions
 * as activity events in BrainStore, and pushes `activity:state` to
 * connected clients.
 *
 * Only works on macOS (osascript-based). Silently skips on other platforms.
 */
export function registerDesktopShellHandler(client: Client, brainStore: BrainStore): void {
  if (platform !== 'darwin') {
    log.log(`Desktop shell handler skipped (platform: ${platform}, only macOS supported)`)
    return
  }

  pollTimer = setInterval(() => {
    getActiveWindow()
      .then((info) => {
        if (!info) {
          return
        }

        // Only record on window/app change to avoid flooding the DB
        if (info.appName === lastAppName && info.windowTitle === lastWindowTitle) {
          return
        }

        lastAppName = info.appName
        lastWindowTitle = info.windowTitle

        const now = Date.now()
        const duration = now - lastSwitchTime

        // Back-fill duration on the previous event
        if (lastEventId && duration > 0) {
          brainStore.updateActivityEventDuration(lastEventId, duration)
        }

        const newId = nanoid()
        brainStore.insertActivityEvent({
          id: newId,
          appName: info.appName,
          windowTitle: info.windowTitle,
          description: `Active: ${info.appName} — ${info.windowTitle}`,
          durationMs: 0,
          timestamp: now,
        })
        lastEventId = newId
        lastSwitchTime = now

        client.send({
          type: 'activity:state',
          data: {
            activities: [{
              timestamp: now,
              app: info.appName,
              description: `Active: ${info.appName} — ${info.windowTitle}`,
              durationMs: duration,
            }],
          },
        })
      })
      .catch((err) => {
        log.withError(err instanceof Error ? err : new Error(String(err))).warn('Active window poll failed')
      })
  }, WINDOW_POLL_INTERVAL_MS)

  log.log('Desktop shell handler registered (active window polling every 10s)')
}

export function disposeDesktopShellHandler(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
    log.log('Desktop shell handler disposed')
  }
}
