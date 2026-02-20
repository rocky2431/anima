import type { ShortcutAction, ShortcutBinding } from '../types'

import { describe, expect, it } from 'vitest'

import { DEFAULT_BINDINGS, ShortcutManager } from '../global-shortcuts'

function createTestBindings(): ShortcutBinding[] {
  return [
    { accelerator: 'CommandOrControl+Shift+A', action: 'toggle-panel' },
    { accelerator: 'CommandOrControl+Shift+V', action: 'voice-input' },
  ]
}

describe('shortcutManager', () => {
  describe('registration', () => {
    it('registers all bindings on registerAll()', () => {
      const registered: string[] = []
      const actions: ShortcutAction[] = []

      const manager = new ShortcutManager({
        bindings: createTestBindings(),
        register: (accelerator, callback) => {
          registered.push(accelerator)
          callback()
          return true
        },
        unregisterAll: () => {},
        onAction: action => actions.push(action),
      })

      manager.registerAll()

      expect(registered).toEqual([
        'CommandOrControl+Shift+A',
        'CommandOrControl+Shift+V',
      ])
      expect(actions).toEqual(['toggle-panel', 'voice-input'])
      expect(manager.isRegistered).toBe(true)
    })

    it('is idempotent on double registerAll()', () => {
      const registered: string[] = []

      const manager = new ShortcutManager({
        bindings: createTestBindings(),
        register: (accelerator) => {
          registered.push(accelerator)
          return true
        },
        unregisterAll: () => {},
        onAction: () => {},
      })

      manager.registerAll()
      manager.registerAll()

      expect(registered).toHaveLength(2)
    })

    it('reports registration failure via onError', () => {
      const errors: Error[] = []

      const manager = new ShortcutManager({
        bindings: createTestBindings(),
        register: () => false,
        unregisterAll: () => {},
        onAction: () => {},
        onError: err => errors.push(err),
      })

      manager.registerAll()

      expect(errors).toHaveLength(2)
      expect(errors[0].message).toContain('CommandOrControl+Shift+A')
    })

    it('throws on registration failure when no onError set', () => {
      const manager = new ShortcutManager({
        bindings: createTestBindings(),
        register: () => false,
        unregisterAll: () => {},
        onAction: () => {},
      })

      expect(() => manager.registerAll()).toThrow('Failed to register shortcut')
    })

    it('handles register throwing an exception', () => {
      const errors: Error[] = []

      const manager = new ShortcutManager({
        bindings: [{ accelerator: 'BadAccelerator', action: 'toggle-panel' }],
        register: () => { throw new Error('Electron error') },
        unregisterAll: () => {},
        onAction: () => {},
        onError: err => errors.push(err),
      })

      manager.registerAll()

      expect(errors).toHaveLength(1)
      expect(errors[0].message).toBe('Electron error')
    })

    it('sets isRegistered=false when all registrations fail with onError', () => {
      const errors: Error[] = []

      const manager = new ShortcutManager({
        bindings: createTestBindings(),
        register: () => false,
        unregisterAll: () => {},
        onAction: () => {},
        onError: err => errors.push(err),
      })

      manager.registerAll()

      expect(errors).toHaveLength(2)
      expect(manager.isRegistered).toBe(false)
    })

    it('sets isRegistered=true when at least one binding succeeds', () => {
      let callCount = 0

      const manager = new ShortcutManager({
        bindings: createTestBindings(),
        register: () => {
          callCount++
          return callCount === 1 // first succeeds, second fails
        },
        unregisterAll: () => {},
        onAction: () => {},
        onError: () => {},
      })

      manager.registerAll()

      expect(manager.isRegistered).toBe(true)
    })
  })

  describe('unregistration', () => {
    it('calls unregisterAll on the underlying API', () => {
      let unregisterAllCalled = false

      const manager = new ShortcutManager({
        bindings: createTestBindings(),
        register: () => true,
        unregisterAll: () => { unregisterAllCalled = true },
        onAction: () => {},
      })

      manager.registerAll()
      manager.unregisterAll()

      expect(unregisterAllCalled).toBe(true)
      expect(manager.isRegistered).toBe(false)
    })

    it('is a no-op when not registered', () => {
      let unregisterAllCalled = false

      const manager = new ShortcutManager({
        bindings: createTestBindings(),
        register: () => true,
        unregisterAll: () => { unregisterAllCalled = true },
        onAction: () => {},
      })

      manager.unregisterAll()

      expect(unregisterAllCalled).toBe(false)
    })

    it('allows re-registration after unregister', () => {
      const registered: string[] = []

      const manager = new ShortcutManager({
        bindings: createTestBindings(),
        register: (accelerator) => {
          registered.push(accelerator)
          return true
        },
        unregisterAll: () => {},
        onAction: () => {},
      })

      manager.registerAll()
      manager.unregisterAll()
      manager.registerAll()

      expect(registered).toHaveLength(4)
    })

    it('resets registered to false even if unregisterAllFn throws', () => {
      const manager = new ShortcutManager({
        bindings: createTestBindings(),
        register: () => true,
        unregisterAll: () => { throw new Error('unregister failed') },
        onAction: () => {},
      })

      manager.registerAll()
      expect(() => manager.unregisterAll()).toThrow('unregister failed')
      expect(manager.isRegistered).toBe(false)
    })
  })

  describe('action dispatch', () => {
    it('dispatches correct action when shortcut callback fires', () => {
      const actions: ShortcutAction[] = []
      const callbacks = new Map<string, () => void>()

      const manager = new ShortcutManager({
        bindings: createTestBindings(),
        register: (accelerator, callback) => {
          callbacks.set(accelerator, callback)
          return true
        },
        unregisterAll: () => {},
        onAction: action => actions.push(action),
      })

      manager.registerAll()

      callbacks.get('CommandOrControl+Shift+A')!()
      expect(actions).toEqual(['toggle-panel'])

      callbacks.get('CommandOrControl+Shift+V')!()
      expect(actions).toEqual(['toggle-panel', 'voice-input'])
    })

    it('catches errors thrown by onAction callback', () => {
      const errors: Error[] = []
      const callbacks = new Map<string, () => void>()

      const manager = new ShortcutManager({
        bindings: [{ accelerator: 'CommandOrControl+Shift+A', action: 'toggle-panel' }],
        register: (accelerator, callback) => {
          callbacks.set(accelerator, callback)
          return true
        },
        unregisterAll: () => {},
        onAction: () => { throw new Error('action handler boom') },
        onError: err => errors.push(err),
      })

      manager.registerAll()
      callbacks.get('CommandOrControl+Shift+A')!()

      expect(errors).toHaveLength(1)
      expect(errors[0].message).toBe('Shortcut action \'toggle-panel\' failed')
      expect(errors[0].cause).toBeInstanceOf(Error)
    })
  })

  describe('default bindings', () => {
    it('exports default bindings with all 4 shortcuts', () => {
      expect(DEFAULT_BINDINGS).toHaveLength(4)
      expect(DEFAULT_BINDINGS.map(b => b.action)).toEqual([
        'toggle-panel',
        'voice-input',
        'quick-chat',
        'show-log',
      ])
    })

    it('all default bindings use CommandOrControl+Shift prefix', () => {
      for (const binding of DEFAULT_BINDINGS) {
        expect(binding.accelerator).toMatch(/^CommandOrControl\+Shift\+/)
      }
    })
  })
})
