import type { AnimaOrchestrator } from './orchestrator'

import { platform } from 'node:process'

import { useLogg } from '@guiiai/logg'
import { ClipboardMonitor, DEFAULT_BINDINGS, getActiveWindow, ShortcutManager } from '@proj-airi/desktop-shell'
import { clipboard, globalShortcut } from 'electron'

const log = useLogg('desktop-shell').useGlobalConfig()

const WINDOW_POLL_INTERVAL_MS = 10_000

export interface DesktopShellHandle {
  stop: () => void
}

/**
 * Wire desktop-shell into the Anima orchestrator.
 *
 * - Periodic active-window polling → orchestrator.recordActivity()
 * - Clipboard monitoring (Electron clipboard API)
 * - Global shortcut registration (Electron globalShortcut API)
 *
 * macOS only for window polling; clipboard and shortcuts work cross-platform.
 */
export function setupDesktopShell(orchestrator: AnimaOrchestrator): DesktopShellHandle {
  let pollTimer: ReturnType<typeof setInterval> | null = null

  // --- Active window polling (macOS only) ---
  if (platform === 'darwin') {
    pollTimer = setInterval(() => {
      getActiveWindow()
        .then((info) => {
          if (info) {
            orchestrator.recordActivity({
              timestamp: Date.now(),
              appName: info.appName,
              windowTitle: info.windowTitle,
              isFullscreen: false,
            })
          }
        })
        .catch((err) => {
          log.withError(err instanceof Error ? err : new Error(String(err))).warn('Active window poll failed')
        })
    }, WINDOW_POLL_INTERVAL_MS)

    log.info('Active window polling started (10s interval)')
  }
  else {
    log.info(`Active window polling skipped (platform: ${platform}, only macOS supported)`)
  }

  // --- Clipboard monitoring ---
  const clipboardMonitor = new ClipboardMonitor({
    pollIntervalMs: 2000,
    readClipboard: () => clipboard.readText(),
    onChange: (change) => {
      log.withFields({ length: change.text.length }).info('Clipboard changed')
    },
    onError: (err) => {
      log.withError(err).warn('Clipboard monitor error')
    },
  })

  try {
    clipboardMonitor.start()
    log.info('Clipboard monitor started')
  }
  catch (err) {
    log.withError(err instanceof Error ? err : new Error(String(err))).warn('Failed to start clipboard monitor')
  }

  // --- Global shortcuts ---
  const shortcutManager = new ShortcutManager({
    bindings: [...DEFAULT_BINDINGS],
    register: (accelerator, callback) => globalShortcut.register(accelerator, callback),
    unregisterAll: () => globalShortcut.unregisterAll(),
    onAction: (action) => {
      log.withFields({ action }).info('Global shortcut triggered')
    },
    onError: (err) => {
      log.withError(err).warn('Shortcut registration error')
    },
  })

  shortcutManager.registerAll()
  log.info('Desktop shell initialized')

  return {
    stop() {
      if (pollTimer) {
        clearInterval(pollTimer)
        pollTimer = null
      }
      clipboardMonitor.stop()
      shortcutManager.unregisterAll()
      log.info('Desktop shell stopped')
    },
  }
}
