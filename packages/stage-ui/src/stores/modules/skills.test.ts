import type { SkillUI } from '../../types/memory'

import { createTestingPinia } from '@pinia/testing'
import { setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useSkillsModuleStore } from './skills'

function createSkill(overrides: Partial<SkillUI> = {}): SkillUI {
  return {
    id: `skill-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Test Skill',
    category: 'utility',
    version: '1.0.0',
    description: 'A test skill',
    source: 'builtin',
    tags: ['test'],
    active: false,
    ...overrides,
  }
}

describe('skills module store', () => {
  beforeEach(() => {
    const pinia = createTestingPinia({ createSpy: vi.fn, stubActions: false })
    setActivePinia(pinia)
  })

  describe('initial state', () => {
    it('should start with empty skills list', () => {
      const store = useSkillsModuleStore()
      expect(store.skills).toEqual([])
    })

    it('should start with empty search query', () => {
      const store = useSkillsModuleStore()
      expect(store.searchQuery).toBe('')
    })
  })

  describe('setSkills', () => {
    it('should replace the skills list', () => {
      const store = useSkillsModuleStore()
      const skills = [createSkill({ id: 'a' }), createSkill({ id: 'b' })]
      store.setSkills(skills)
      expect(store.skills).toHaveLength(2)
    })
  })

  describe('toggleSkill', () => {
    it('should activate an inactive skill', () => {
      const store = useSkillsModuleStore()
      store.setSkills([createSkill({ id: 'toggle-me', active: false })])
      store.toggleSkill('toggle-me')
      expect(store.skills[0].active).toBe(true)
    })

    it('should deactivate an active skill', () => {
      const store = useSkillsModuleStore()
      store.setSkills([createSkill({ id: 'toggle-me', active: true })])
      store.toggleSkill('toggle-me')
      expect(store.skills[0].active).toBe(false)
    })

    it('should do nothing for nonexistent id', () => {
      const store = useSkillsModuleStore()
      store.setSkills([createSkill({ active: false })])
      store.toggleSkill('nonexistent')
      expect(store.skills[0].active).toBe(false)
    })
  })

  describe('filteredSkills', () => {
    it('should return all skills when no search query', () => {
      const store = useSkillsModuleStore()
      store.setSkills([createSkill(), createSkill()])
      expect(store.filteredSkills).toHaveLength(2)
    })

    it('should filter by name (case-insensitive)', () => {
      const store = useSkillsModuleStore()
      store.setSkills([
        createSkill({ name: 'Web Search' }),
        createSkill({ name: 'File Manager' }),
        createSkill({ name: 'Search Engine' }),
      ])
      store.searchQuery = 'search'
      expect(store.filteredSkills).toHaveLength(2)
    })

    it('should filter by description', () => {
      const store = useSkillsModuleStore()
      store.setSkills([
        createSkill({ name: 'A', description: 'Searches the web' }),
        createSkill({ name: 'B', description: 'Manages files' }),
      ])
      store.searchQuery = 'web'
      expect(store.filteredSkills).toHaveLength(1)
      expect(store.filteredSkills[0].name).toBe('A')
    })

    it('should filter by tags', () => {
      const store = useSkillsModuleStore()
      store.setSkills([
        createSkill({ name: 'A', tags: ['search', 'web'] }),
        createSkill({ name: 'B', tags: ['files'] }),
      ])
      store.searchQuery = 'web'
      expect(store.filteredSkills).toHaveLength(1)
    })
  })

  describe('activeCount', () => {
    it('should count active skills', () => {
      const store = useSkillsModuleStore()
      store.setSkills([
        createSkill({ active: true }),
        createSkill({ active: false }),
        createSkill({ active: true }),
      ])
      expect(store.activeCount).toBe(2)
    })
  })

  describe('getSkillById', () => {
    it('should return skill by id', () => {
      const store = useSkillsModuleStore()
      store.setSkills([createSkill({ id: 'find-me', name: 'Found' })])
      expect(store.getSkillById('find-me')?.name).toBe('Found')
    })

    it('should return undefined for nonexistent id', () => {
      const store = useSkillsModuleStore()
      expect(store.getSkillById('nope')).toBeUndefined()
    })
  })

  describe('resetState', () => {
    it('should clear all state', () => {
      const store = useSkillsModuleStore()
      store.setSkills([createSkill()])
      store.searchQuery = 'test'
      store.resetState()
      expect(store.skills).toEqual([])
      expect(store.searchQuery).toBe('')
    })
  })
})
