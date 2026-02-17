import type { Conversation, Todo } from '../storage/types'

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DocumentStore } from '../storage/document-store'

describe('documentStore', () => {
  let tmpDir: string
  let dbPath: string
  let store: DocumentStore

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docstore-test-'))
    dbPath = path.join(tmpDir, 'anima.db')
    store = new DocumentStore(dbPath)
  })

  afterEach(() => {
    store.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('conversations', () => {
    it('inserts and retrieves conversations', () => {
      const conv: Conversation = {
        id: 'c1',
        role: 'user',
        content: 'Hello Anima',
        createdAt: Date.now(),
      }
      store.insertConversation(conv)

      const recent = store.getRecentConversations(10)
      expect(recent).toHaveLength(1)
      expect(recent[0].id).toBe('c1')
      expect(recent[0].content).toBe('Hello Anima')
    })

    it('returns conversations in reverse chronological order', () => {
      const now = Date.now()
      store.insertConversation({ id: 'c1', role: 'user', content: 'first', createdAt: now - 2000 })
      store.insertConversation({ id: 'c2', role: 'assistant', content: 'second', createdAt: now - 1000 })
      store.insertConversation({ id: 'c3', role: 'user', content: 'third', createdAt: now })

      const recent = store.getRecentConversations(2)
      expect(recent).toHaveLength(2)
      expect(recent[0].id).toBe('c3')
      expect(recent[1].id).toBe('c2')
    })

    it('limits returned conversations count', () => {
      for (let i = 0; i < 20; i++) {
        store.insertConversation({
          id: `c${i}`,
          role: 'user',
          content: `message ${i}`,
          createdAt: Date.now() + i,
        })
      }

      const recent = store.getRecentConversations(5)
      expect(recent).toHaveLength(5)
    })
  })

  describe('todos', () => {
    it('inserts and retrieves todos', () => {
      const todo: Todo = {
        id: 't1',
        title: 'Buy groceries',
        completed: false,
        createdAt: Date.now(),
        completedAt: null,
      }
      store.upsertTodo(todo)

      const todos = store.getTodos()
      expect(todos).toHaveLength(1)
      expect(todos[0].title).toBe('Buy groceries')
      expect(todos[0].completed).toBe(false)
    })

    it('updates existing todo via upsert', () => {
      const now = Date.now()
      store.upsertTodo({
        id: 't1',
        title: 'Buy groceries',
        completed: false,
        createdAt: now,
        completedAt: null,
      })

      store.upsertTodo({
        id: 't1',
        title: 'Buy groceries',
        completed: true,
        createdAt: now,
        completedAt: now + 1000,
      })

      const todos = store.getTodos()
      expect(todos).toHaveLength(1)
      expect(todos[0].completed).toBe(true)
      expect(todos[0].completedAt).toBe(now + 1000)
    })
  })

  describe('settings', () => {
    it('sets and gets settings', () => {
      store.setSetting('theme', 'dark')
      expect(store.getSetting('theme')).toBe('dark')
    })

    it('returns null for non-existent setting', () => {
      expect(store.getSetting('nonexistent')).toBeNull()
    })

    it('overwrites existing settings', () => {
      store.setSetting('theme', 'dark')
      store.setSetting('theme', 'light')
      expect(store.getSetting('theme')).toBe('light')
    })
  })

  describe('intimacy', () => {
    it('starts at 0 and tracks changes', () => {
      expect(store.getIntimacy()).toBe(0)

      const newLevel = store.updateIntimacy(10)
      expect(newLevel).toBe(10)
      expect(store.getIntimacy()).toBe(10)
    })

    it('accumulates positive and negative deltas', () => {
      store.updateIntimacy(50)
      store.updateIntimacy(-20)
      expect(store.getIntimacy()).toBe(30)
    })

    it('does not go below 0', () => {
      store.updateIntimacy(10)
      const level = store.updateIntimacy(-100)
      expect(level).toBe(0)
      expect(store.getIntimacy()).toBe(0)
    })
  })

  describe('persistence', () => {
    it('persists data across reconnect', () => {
      store.insertConversation({
        id: 'c1',
        role: 'user',
        content: 'persist me',
        createdAt: Date.now(),
      })
      store.setSetting('version', '1.0')
      store.updateIntimacy(42)
      store.close()

      const store2 = new DocumentStore(dbPath)
      expect(store2.getRecentConversations(1)[0].content).toBe('persist me')
      expect(store2.getSetting('version')).toBe('1.0')
      expect(store2.getIntimacy()).toBe(42)
      store2.close()

      // Reopen for afterEach cleanup
      store = new DocumentStore(dbPath)
    })
  })
})
