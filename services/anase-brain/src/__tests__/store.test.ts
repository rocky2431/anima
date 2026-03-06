import { randomBytes } from 'node:crypto'

import Database from 'better-sqlite3'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BrainStore } from '../store'

describe('brainStore', () => {
  let db: Database.Database
  let store: BrainStore

  beforeEach(() => {
    db = new Database(':memory:')
    store = new BrainStore(db)
  })

  afterEach(() => {
    db.close()
  })

  describe('constructor', () => {
    it('creates all required tables', () => {
      const tables = db.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`,
      ).all() as Array<{ name: string }>
      const tableNames = tables.map(t => t.name)

      expect(tableNames).toContain('skills_state')
      expect(tableNames).toContain('activity_events')
      expect(tableNames).toContain('activity_summaries')
      expect(tableNames).toContain('vision_config')
      expect(tableNames).toContain('vision_stats')
      expect(tableNames).toContain('embedding_config')
      expect(tableNames).toContain('llm_config')
      expect(tableNames).toContain('provider_configs')
      expect(tableNames).toContain('provider_credentials')
    })

    it('initializes singleton rows for config tables', () => {
      const visionConfig = db.prepare('SELECT * FROM vision_config WHERE singleton = 1').get()
      expect(visionConfig).toBeDefined()

      const embeddingConfig = db.prepare('SELECT * FROM embedding_config WHERE singleton = 1').get()
      expect(embeddingConfig).toBeDefined()

      const llmConfig = db.prepare('SELECT * FROM llm_config WHERE singleton = 1').get()
      expect(llmConfig).toBeDefined()
    })
  })

  describe('skills state', () => {
    it('sets and gets skill active state', () => {
      store.setSkillActive('test-skill', true)
      expect(store.getSkillActiveState('test-skill')).toBe(true)

      store.setSkillActive('test-skill', false)
      expect(store.getSkillActiveState('test-skill')).toBe(false)
    })

    it('returns null for unknown skill', () => {
      expect(store.getSkillActiveState('nonexistent')).toBeNull()
    })

    it('gets all skill states', () => {
      store.setSkillActive('a', true)
      store.setSkillActive('b', false)
      const states = store.getAllSkillStates()
      expect(states.get('a')).toBe(true)
      expect(states.get('b')).toBe(false)
    })
  })

  describe('activity events', () => {
    const event = {
      id: 'evt-1',
      appName: 'VS Code',
      windowTitle: 'index.ts',
      description: 'Editing code',
      durationMs: 5000,
      timestamp: Date.now(),
    }

    it('inserts and retrieves events', () => {
      store.insertActivityEvent(event)
      const events = store.getActivityEvents({ limit: 10 })
      expect(events).toHaveLength(1)
      expect(events[0].appName).toBe('VS Code')
      expect(events[0].windowTitle).toBe('index.ts')
    })

    it('filters events by date', () => {
      const today = new Date().toISOString().slice(0, 10)
      store.insertActivityEvent(event)
      const events = store.getActivityEvents({ date: today })
      expect(events.length).toBeGreaterThanOrEqual(1)
    })

    it('updates event duration', () => {
      store.insertActivityEvent(event)
      store.updateActivityEventDuration('evt-1', 10000)
      const events = store.getActivityEvents({ limit: 1 })
      expect(events[0].durationMs).toBe(10000)
    })
  })

  describe('activity summaries', () => {
    it('upserts and retrieves summary', () => {
      const summary = {
        date: '2026-03-04',
        highlights: ['Built new feature', 'Fixed bug'],
        breakdown: [{ app: 'VS Code', durationMs: 3600000, description: 'Coding' }],
        totalWorkDurationMs: 3600000,
      }

      store.upsertActivitySummary(summary)
      const result = store.getActivitySummary('2026-03-04')

      expect(result).not.toBeNull()
      expect(result!.highlights).toEqual(['Built new feature', 'Fixed bug'])
      expect(result!.breakdown).toEqual([{ app: 'VS Code', durationMs: 3600000, description: 'Coding' }])
    })

    it('returns null for missing date', () => {
      expect(store.getActivitySummary('1999-01-01')).toBeNull()
    })

    it('handles corrupted JSON gracefully', () => {
      db.prepare(
        `INSERT INTO activity_summaries (date, highlights, breakdown, total_work_duration_ms)
         VALUES (?, ?, ?, ?)`,
      ).run('2026-01-01', 'NOT_VALID_JSON', '[]', 0)

      const result = store.getActivitySummary('2026-01-01')
      expect(result).not.toBeNull()
      expect(result!.highlights).toEqual([])
    })
  })

  describe('vision config', () => {
    it('gets default vision config', () => {
      const config = store.getVisionConfig()
      expect(config.enabled).toBe(false)
      expect(config.intervalMs).toBe(60000)
      expect(config.similarityThreshold).toBe(5)
    })

    it('sets and retrieves vision config', () => {
      store.setVisionConfig({
        enabled: true,
        intervalMs: 30000,
        similarityThreshold: 3,
        vlmProvider: 'openai',
        vlmModel: 'gpt-4-vision',
      })
      const config = store.getVisionConfig()
      expect(config.enabled).toBe(true)
      expect(config.intervalMs).toBe(30000)
      expect(config.vlmProvider).toBe('openai')
    })
  })

  describe('embedding config', () => {
    it('gets default empty embedding config', () => {
      const config = store.getEmbeddingConfig()
      expect(config.provider).toBe('')
      expect(config.apiKey).toBe('')
    })

    it('sets and retrieves embedding config', () => {
      store.setEmbeddingConfig({
        provider: 'openai',
        apiKey: 'sk-test',
        baseURL: 'https://api.openai.com/v1/',
        model: 'text-embedding-3-small',
      })
      const config = store.getEmbeddingConfig()
      expect(config.provider).toBe('openai')
      expect(config.model).toBe('text-embedding-3-small')
    })
  })

  describe('lLM config', () => {
    it('gets default empty LLM config', () => {
      const config = store.getLlmConfig()
      expect(config.provider).toBe('')
    })

    it('sets and retrieves LLM config', () => {
      store.setLlmConfig({
        provider: 'openrouter',
        apiKey: 'sk-or-test',
        baseURL: 'https://openrouter.ai/api/v1/',
        model: 'anthropic/claude-3.5-sonnet',
      })
      const config = store.getLlmConfig()
      expect(config.provider).toBe('openrouter')
      expect(config.model).toBe('anthropic/claude-3.5-sonnet')
    })
  })

  describe('provider configs', () => {
    it('persists and retrieves provider configs', () => {
      const configs = {
        openrouter: { apiKey: 'sk-or-test', baseUrl: 'https://openrouter.ai/api/v1' },
        dashscope: { apiKey: 'sk-ds-test', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
      }
      const added = { openrouter: true, dashscope: false }

      store.setProviderConfigs(configs, added)
      const result = store.getProviderConfigs()

      expect(result.configs.openrouter).toBeDefined()
      expect((result.configs.openrouter as Record<string, string>).apiKey).toBe('sk-or-test')
      expect(result.added.openrouter).toBe(true)
      expect(result.added.dashscope).toBeUndefined()
    })

    it('skips providers with no credentials', () => {
      store.setProviderConfigs(
        { empty: { apiKey: '', baseUrl: '' } },
        { empty: true },
      )
      const result = store.getProviderConfigs()
      expect(result.configs.empty).toBeUndefined()
    })

    it('handles corrupted config_json gracefully', () => {
      db.prepare(
        `INSERT INTO provider_configs (provider_id, config_json, added, updated_at)
         VALUES (?, ?, ?, ?)`,
      ).run('corrupt', 'NOT_JSON', 0, Date.now())

      const result = store.getProviderConfigs()
      expect(result.configs.corrupt).toBeUndefined()
    })
  })

  describe('vision stats', () => {
    it('gets default vision stats', () => {
      const stats = store.getVisionStats()
      expect(stats.total).toBe(0)
      expect(stats.uniqueCount).toBe(0)
    })

    it('updates and retrieves vision stats', () => {
      store.updateVisionStats({ total: 100, uniqueCount: 80, duplicates: 20 })
      const stats = store.getVisionStats()
      expect(stats.total).toBe(100)
      expect(stats.uniqueCount).toBe(80)
      expect(stats.duplicates).toBe(20)
    })
  })

  describe('provider credentials (no encryption key)', () => {
    it('stores and retrieves credentials in plaintext without encryption key', () => {
      const config = { apiKey: 'sk-test-123', baseUrl: 'https://api.example.com' }
      store.setProviderCredentials('openai', config)
      const result = store.getProviderCredentials('openai')
      expect(result).toEqual(config)
    })

    it('returns null for unknown provider', () => {
      expect(store.getProviderCredentials('nonexistent')).toBeNull()
    })

    it('lists provider IDs', () => {
      store.setProviderCredentials('openai', { apiKey: 'sk-1' })
      store.setProviderCredentials('anthropic', { apiKey: 'sk-2' })
      const ids = store.listProviderIds()
      expect(ids).toEqual(['anthropic', 'openai'])
    })

    it('deletes credentials', () => {
      store.setProviderCredentials('openai', { apiKey: 'sk-1' })
      store.deleteProviderCredentials('openai')
      expect(store.getProviderCredentials('openai')).toBeNull()
      expect(store.listProviderIds()).toEqual([])
    })

    it('upserts on conflict', () => {
      store.setProviderCredentials('openai', { apiKey: 'sk-old' })
      store.setProviderCredentials('openai', { apiKey: 'sk-new' })
      const result = store.getProviderCredentials('openai')
      expect(result).toEqual({ apiKey: 'sk-new' })
    })
  })

  describe('provider credentials (with encryption key)', () => {
    const testKey = randomBytes(32).toString('hex')

    beforeEach(() => {
      vi.stubEnv('ANASE_ENCRYPTION_KEY', testKey)
    })

    afterEach(() => {
      vi.unstubAllEnvs()
    })

    it('encrypts and decrypts credentials round-trip', () => {
      // Need a fresh store so encryption key is picked up
      const encDb = new Database(':memory:')
      const encStore = new BrainStore(encDb)

      const config = { apiKey: 'sk-secret-key', baseUrl: 'https://api.openai.com/v1' }
      encStore.setProviderCredentials('openai', config)

      // Verify stored data is not plaintext
      const row = encDb.prepare('SELECT config_encrypted FROM provider_credentials WHERE provider_id = ?').get('openai') as { config_encrypted: string }
      expect(row.config_encrypted).not.toContain('sk-secret-key')

      // Verify decryption works
      const result = encStore.getProviderCredentials('openai')
      expect(result).toEqual(config)

      encDb.close()
    })

    it('lists and deletes with encryption enabled', () => {
      const encDb = new Database(':memory:')
      const encStore = new BrainStore(encDb)

      encStore.setProviderCredentials('a', { key: '1' })
      encStore.setProviderCredentials('b', { key: '2' })
      expect(encStore.listProviderIds()).toEqual(['a', 'b'])

      encStore.deleteProviderCredentials('a')
      expect(encStore.listProviderIds()).toEqual(['b'])

      encDb.close()
    })
  })
})
