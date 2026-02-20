import { describe, expect, it } from 'vitest'

import { parseAppleScriptOutput } from '../active-window'

describe('parseAppleScriptOutput', () => {
  it('parses tab-separated output with app name, window title, and pid', () => {
    const result = parseAppleScriptOutput('VS Code\teditor.ts — project\t12345')
    expect(result).toEqual({
      appName: 'VS Code',
      windowTitle: 'editor.ts — project',
      pid: 12345,
    })
  })

  it('handles empty window title', () => {
    const result = parseAppleScriptOutput('Finder\t\t5678')
    expect(result).toEqual({
      appName: 'Finder',
      windowTitle: '',
      pid: 5678,
    })
  })

  it('returns null for empty string', () => {
    const result = parseAppleScriptOutput('')
    expect(result).toBeNull()
  })

  it('returns null for whitespace-only string', () => {
    const result = parseAppleScriptOutput('   \n  ')
    expect(result).toBeNull()
  })

  it('handles non-numeric pid gracefully', () => {
    const result = parseAppleScriptOutput('Chrome\tGoogle\tnotanumber')
    expect(result).toEqual({
      appName: 'Chrome',
      windowTitle: 'Google',
      pid: 0,
    })
  })

  it('trims trailing newline from osascript output', () => {
    const result = parseAppleScriptOutput('Safari\tApple\t9999\n')
    expect(result).toEqual({
      appName: 'Safari',
      windowTitle: 'Apple',
      pid: 9999,
    })
  })

  it('handles output with only app name and no tabs', () => {
    const result = parseAppleScriptOutput('Finder')
    expect(result).toEqual({
      appName: 'Finder',
      windowTitle: '',
      pid: 0,
    })
  })

  it('handles unicode characters in window title', () => {
    const result = parseAppleScriptOutput('Chrome\t测试页面 — 中文\t4321')
    expect(result).toEqual({
      appName: 'Chrome',
      windowTitle: '测试页面 — 中文',
      pid: 4321,
    })
  })
})
