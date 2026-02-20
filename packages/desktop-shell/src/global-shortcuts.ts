import type { ShortcutBinding, ShortcutManagerOptions } from './types'

/** Default shortcut bindings using Electron accelerator syntax. Override via user config. */
export const DEFAULT_BINDINGS: readonly ShortcutBinding[] = [
  { accelerator: 'CommandOrControl+Shift+A', action: 'toggle-panel' },
  { accelerator: 'CommandOrControl+Shift+V', action: 'voice-input' },
  { accelerator: 'CommandOrControl+Shift+C', action: 'quick-chat' },
  { accelerator: 'CommandOrControl+Shift+L', action: 'show-log' },
] as const

/** Manages global keyboard shortcut registration/unregistration. */
export class ShortcutManager {
  private readonly bindings: ShortcutManagerOptions['bindings']
  private readonly registerFn: ShortcutManagerOptions['register']
  private readonly unregisterAllFn: ShortcutManagerOptions['unregisterAll']
  private readonly onAction: ShortcutManagerOptions['onAction']
  private readonly onError: ShortcutManagerOptions['onError']
  private registered = false

  constructor(options: ShortcutManagerOptions) {
    this.bindings = options.bindings
    this.registerFn = options.register
    this.unregisterAllFn = options.unregisterAll
    this.onAction = options.onAction
    this.onError = options.onError
  }

  /** Register all bindings. Idempotent. Sets isRegistered only if at least one succeeded. */
  registerAll(): void {
    if (this.registered) {
      return
    }

    let successCount = 0
    for (const binding of this.bindings) {
      if (this.registerBinding(binding)) {
        successCount++
      }
    }

    this.registered = successCount > 0
  }

  /** Unregister all shortcuts. No-op if not registered. */
  unregisterAll(): void {
    if (!this.registered) {
      return
    }

    try {
      this.unregisterAllFn()
    }
    finally {
      this.registered = false
    }
  }

  get isRegistered(): boolean {
    return this.registered
  }

  private registerBinding(binding: ShortcutBinding): boolean {
    try {
      const success = this.registerFn(binding.accelerator, () => {
        try {
          this.onAction(binding.action)
        }
        catch (err) {
          this.reportError(new Error(`Shortcut action '${binding.action}' failed`, { cause: err }))
        }
      })
      if (!success) {
        this.reportError(new Error(`Failed to register shortcut: ${binding.accelerator}`))
        return false
      }
      return true
    }
    catch (err) {
      this.reportError(
        err instanceof Error
          ? err
          : new Error(`Failed to register shortcut: ${binding.accelerator}`, { cause: err }),
      )
      return false
    }
  }

  private reportError(error: Error): void {
    if (this.onError) {
      this.onError(error)
    }
    else {
      throw error
    }
  }
}
