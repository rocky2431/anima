import { execFile } from 'node:child_process'
import { platform } from 'node:os'

import { describe, expect, it } from 'vitest'

import { getActiveWindow } from '../active-window'

function canRunOsascript(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('osascript', ['-e', 'return "ping"'], { timeout: 3000 }, (error, stdout) => {
      resolve(!error && stdout.trim() === 'ping')
    })
  })
}

describe.runIf(platform() === 'darwin')('getActiveWindow integration (macOS only)', () => {
  it('osascript binary is available and responsive', async () => {
    const available = await canRunOsascript()
    expect(available).toBe(true)
  })

  it('returns error or valid info depending on accessibility permissions', async () => {
    try {
      const info = await getActiveWindow()
      if (info !== null) {
        expect(info.appName).toBeTruthy()
        expect(typeof info.pid).toBe('number')
        expect(info.pid).toBeGreaterThan(0)
      }
    }
    catch (err) {
      expect(err).toBeInstanceOf(Error)
      expect((err as Error).message).toBe('Failed to get active window')
    }
  }, 10_000)
})
