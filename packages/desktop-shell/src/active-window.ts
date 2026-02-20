import type { ActiveWindowInfo } from './types'

import { execFile } from 'node:child_process'

/**
 * AppleScript to get the active window info.
 * Platform: macOS only. Uses osascript/AppleScript via System Events.
 * Returns tab-delimited: appName\twindowTitle\tpid
 */
const APPLESCRIPT = `
tell application "System Events"
  set frontApp to first application process whose frontmost is true
  set appName to name of frontApp
  set appPID to unix id of frontApp
  try
    set winTitle to name of front window of frontApp
  on error
    set winTitle to ""
  end try
  return appName & "\t" & winTitle & "\t" & appPID
end tell
`

/**
 * Parse tab-delimited osascript output into ActiveWindowInfo.
 * Returns null when input is empty or whitespace-only (no active window data).
 */
export function parseAppleScriptOutput(stdout: string): ActiveWindowInfo | null {
  const trimmed = stdout.trim()
  if (trimmed === '') {
    return null
  }

  const parts = trimmed.split('\t')
  const appName = parts[0] ?? ''
  const windowTitle = parts[1] ?? ''
  const pidStr = parts[2] ?? '0'
  const pid = Number.parseInt(pidStr, 10)

  return {
    appName,
    windowTitle,
    pid: Number.isNaN(pid) ? 0 : pid,
  }
}

/**
 * Get the currently active (frontmost) window on macOS.
 * Uses osascript with a 5000ms timeout. Requires Accessibility permissions.
 * @throws On non-macOS platforms or when osascript fails.
 */
export function getActiveWindow(): Promise<ActiveWindowInfo | null> {
  if (process.platform !== 'darwin') {
    return Promise.reject(new Error('getActiveWindow is only supported on macOS'))
  }

  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', APPLESCRIPT], { timeout: 5000 }, (error, stdout) => {
      if (error) {
        reject(new Error('Failed to get active window', { cause: error }))
        return
      }
      resolve(parseAppleScriptOutput(stdout))
    })
  })
}
