import type { ImportantDate, MemoryEntry, Relationship, UserProfileFact } from '../storage/types'

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DocumentStore } from '../storage/document-store'

describe('documentStore memory tables', () => {
  let tmpDir: string
  let dbPath: string
  let store: DocumentStore

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docstore-memory-test-'))
    dbPath = path.join(tmpDir, 'anima.db')
    store = new DocumentStore(dbPath)
  })

  afterEach(() => {
    store.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('user_profile_facts', () => {
    it('inserts and retrieves profile facts', () => {
      const fact: UserProfileFact = {
        id: 'pf1',
        fact: 'prefers dark mode',
        evidenceDate: '2026-02-19',
        confidence: 0.9,
        createdAt: Date.now(),
      }
      store.insertProfileFact(fact)

      const facts = store.getProfileFacts()
      expect(facts).toHaveLength(1)
      expect(facts[0].fact).toBe('prefers dark mode')
      expect(facts[0].confidence).toBe(0.9)
    })

    it('returns multiple facts ordered by created_at desc', () => {
      const now = Date.now()
      store.insertProfileFact({
        id: 'pf1',
        fact: 'likes coffee',
        evidenceDate: '2026-02-18',
        confidence: 0.8,
        createdAt: now - 1000,
      })
      store.insertProfileFact({
        id: 'pf2',
        fact: 'works as engineer',
        evidenceDate: '2026-02-19',
        confidence: 0.95,
        createdAt: now,
      })

      const facts = store.getProfileFacts()
      expect(facts).toHaveLength(2)
      expect(facts[0].id).toBe('pf2')
    })
  })

  describe('relationships', () => {
    it('inserts and retrieves relationships', () => {
      const rel: Relationship = {
        id: 'r1',
        personName: 'Alice',
        relationshipType: 'colleague',
        lastMentioned: Date.now(),
        createdAt: Date.now(),
      }
      store.upsertRelationship(rel)

      const rels = store.getRelationships()
      expect(rels).toHaveLength(1)
      expect(rels[0].personName).toBe('Alice')
    })

    it('updates existing relationship on name conflict', () => {
      const now = Date.now()
      store.upsertRelationship({
        id: 'r1',
        personName: 'Alice',
        relationshipType: 'colleague',
        lastMentioned: now,
        createdAt: now,
      })
      store.upsertRelationship({
        id: 'r2',
        personName: 'Alice',
        relationshipType: 'friend',
        lastMentioned: now + 1000,
        createdAt: now + 1000,
      })

      const rels = store.getRelationships()
      expect(rels).toHaveLength(1)
      expect(rels[0].relationshipType).toBe('friend')
      expect(rels[0].lastMentioned).toBe(now + 1000)
    })

    it('retrieves relationship by name', () => {
      const now = Date.now()
      store.upsertRelationship({
        id: 'r1',
        personName: 'Alice',
        relationshipType: 'colleague',
        lastMentioned: now,
        createdAt: now,
      })
      store.upsertRelationship({
        id: 'r2',
        personName: 'Bob',
        relationshipType: 'friend',
        lastMentioned: now,
        createdAt: now,
      })

      const alice = store.getRelationshipByName('Alice')
      expect(alice).not.toBeNull()
      expect(alice!.relationshipType).toBe('colleague')

      const missing = store.getRelationshipByName('Charlie')
      expect(missing).toBeNull()
    })
  })

  describe('important_dates', () => {
    it('inserts and retrieves important dates', () => {
      const date: ImportantDate = {
        id: 'd1',
        date: '03-15',
        dateType: 'birthday',
        label: 'Mom birthday',
        description: 'Remember to call her',
        createdAt: Date.now(),
      }
      store.insertImportantDate(date)

      const dates = store.getImportantDates()
      expect(dates).toHaveLength(1)
      expect(dates[0].label).toBe('Mom birthday')
    })

    it('retrieves dates matching today (MM-DD)', () => {
      const now = Date.now()
      store.insertImportantDate({
        id: 'd1',
        date: '02-19',
        dateType: 'birthday',
        label: 'Friend birthday',
        description: '',
        createdAt: now,
      })
      store.insertImportantDate({
        id: 'd2',
        date: '12-25',
        dateType: 'holiday',
        label: 'Christmas',
        description: '',
        createdAt: now,
      })
      store.insertImportantDate({
        id: 'd3',
        date: '2026-02-19',
        dateType: 'deadline',
        label: 'Project deadline',
        description: '',
        createdAt: now,
      })

      const todayDates = store.getImportantDatesForToday('02-19')
      expect(todayDates).toHaveLength(2)
      expect(todayDates.map(d => d.label)).toContain('Friend birthday')
      expect(todayDates.map(d => d.label)).toContain('Project deadline')
    })
  })

  describe('memory_entries', () => {
    it('inserts and retrieves memory entries', () => {
      const entry: MemoryEntry = {
        id: 'm1',
        content: 'User mentioned they enjoy hiking on weekends',
        importance: 8,
        category: 'preference',
        sourceDate: '2026-02-19',
        createdAt: Date.now(),
      }
      store.insertMemoryEntry(entry)

      const entries = store.getMemoryEntries(10)
      expect(entries).toHaveLength(1)
      expect(entries[0].content).toContain('hiking')
      expect(entries[0].importance).toBe(8)
    })

    it('limits returned entries', () => {
      const now = Date.now()
      for (let i = 0; i < 10; i++) {
        store.insertMemoryEntry({
          id: `m${i}`,
          content: `memory ${i}`,
          importance: 7 + (i % 3),
          category: 'event',
          sourceDate: '2026-02-19',
          createdAt: now + i,
        })
      }

      const entries = store.getMemoryEntries(5)
      expect(entries).toHaveLength(5)
    })

    it('retrieves entries by category', () => {
      const now = Date.now()
      store.insertMemoryEntry({
        id: 'm1',
        content: 'likes dark mode',
        importance: 8,
        category: 'preference',
        sourceDate: '2026-02-19',
        createdAt: now,
      })
      store.insertMemoryEntry({
        id: 'm2',
        content: 'had a meeting today',
        importance: 7,
        category: 'event',
        sourceDate: '2026-02-19',
        createdAt: now + 1,
      })

      const prefs = store.getMemoryEntriesByCategory('preference', 10)
      expect(prefs).toHaveLength(1)
      expect(prefs[0].content).toContain('dark mode')
    })
  })

  describe('persistence across reconnect', () => {
    it('persists memory data across reconnect', () => {
      store.insertProfileFact({
        id: 'pf1',
        fact: 'test fact',
        evidenceDate: '2026-02-19',
        confidence: 0.9,
        createdAt: Date.now(),
      })
      store.insertMemoryEntry({
        id: 'm1',
        content: 'test memory',
        importance: 8,
        category: 'event',
        sourceDate: '2026-02-19',
        createdAt: Date.now(),
      })
      store.close()

      const store2 = new DocumentStore(dbPath)
      expect(store2.getProfileFacts()).toHaveLength(1)
      expect(store2.getMemoryEntries(10)).toHaveLength(1)
      store2.close()

      // Reopen for afterEach cleanup
      store = new DocumentStore(dbPath)
    })
  })
})
