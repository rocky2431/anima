/** Snapshot of the currently active (frontmost) window. null pid means detection failed. */
export interface ActiveWindowInfo {
  readonly appName: string
  readonly windowTitle: string
  readonly pid: number
}

/** Emitted when clipboard content changes. */
export interface ClipboardChange {
  readonly text: string
  readonly previousText: string
  /** Unix epoch milliseconds */
  readonly timestamp: number
}

export interface ClipboardMonitorOptions {
  /** Poll interval in milliseconds. Must be positive. Defaults to 1000. */
  pollIntervalMs?: number
  readClipboard: () => string
  onChange: (change: ClipboardChange) => void
  onError: (error: Error) => void
}

export type ShortcutAction = 'toggle-panel' | 'voice-input' | 'quick-chat' | 'show-log'

/** Electron-style accelerator binding. */
export interface ShortcutBinding {
  /** Electron accelerator string, e.g. 'CommandOrControl+Shift+A' */
  accelerator: string
  action: ShortcutAction
}

export interface ShortcutManagerOptions {
  bindings: ShortcutBinding[]
  register: (accelerator: string, callback: () => void) => boolean
  unregisterAll: () => void
  onAction: (action: ShortcutAction) => void
  onError?: (error: Error) => void
}
