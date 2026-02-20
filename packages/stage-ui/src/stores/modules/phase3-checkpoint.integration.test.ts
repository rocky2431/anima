import type { ActivityEntryUI, DailySummaryUI, MemoryEntryUI, SkillUI, TodoUI } from '../../types/memory'

import { createTestingPinia } from '@pinia/testing'
import { setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useActivityModuleStore } from './activity'
import { useMemoryModuleStore } from './memory'
import { useSkillsModuleStore } from './skills'
import { useTodoModuleStore } from './todo'

function createMemory(overrides: Partial<MemoryEntryUI> = {}): MemoryEntryUI {
  return {
    id: `mem-${Math.random().toString(36).slice(2, 8)}`,
    content: 'Test memory',
    importance: 7,
    category: 'event',
    sourceDate: '2026-02-20',
    createdAt: Date.now(),
    ...overrides,
  }
}

function createTodo(overrides: Partial<TodoUI> = {}): TodoUI {
  return {
    id: `todo-${Math.random().toString(36).slice(2, 8)}`,
    title: 'Test todo',
    completed: false,
    createdAt: Date.now(),
    completedAt: null,
    ...overrides,
  }
}

function createActivity(overrides: Partial<ActivityEntryUI> = {}): ActivityEntryUI {
  return {
    timestamp: Date.now(),
    app: 'VS Code',
    description: 'Coding TypeScript',
    durationMs: 3600000,
    ...overrides,
  }
}

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

describe('phase 3 checkpoint: UI stores coherence', () => {
  beforeEach(() => {
    const pinia = createTestingPinia({ createSpy: vi.fn, stubActions: false })
    setActivePinia(pinia)
  })

  describe('all 4 stores coexist independently', () => {
    it('creates all 4 stores without conflicts', () => {
      const memoryStore = useMemoryModuleStore()
      const todoStore = useTodoModuleStore()
      const activityStore = useActivityModuleStore()
      const skillsStore = useSkillsModuleStore()

      expect(memoryStore).toBeDefined()
      expect(todoStore).toBeDefined()
      expect(activityStore).toBeDefined()
      expect(skillsStore).toBeDefined()

      // All start empty
      expect(memoryStore.memories).toEqual([])
      expect(todoStore.todos).toEqual([])
      expect(activityStore.activities).toEqual([])
      expect(skillsStore.skills).toEqual([])
    })

    it('mutations in one store do not affect others', () => {
      const memoryStore = useMemoryModuleStore()
      const todoStore = useTodoModuleStore()
      const activityStore = useActivityModuleStore()
      const skillsStore = useSkillsModuleStore()

      // Populate all stores
      memoryStore.setMemories([createMemory(), createMemory()])
      todoStore.setTodos([createTodo(), createTodo(), createTodo()])
      activityStore.setActivities([createActivity()])
      skillsStore.setSkills([createSkill()])

      // Verify counts are independent
      expect(memoryStore.memories).toHaveLength(2)
      expect(todoStore.todos).toHaveLength(3)
      expect(activityStore.activities).toHaveLength(1)
      expect(skillsStore.skills).toHaveLength(1)

      // Reset one store
      memoryStore.resetState()

      // Others should be unaffected
      expect(memoryStore.memories).toHaveLength(0)
      expect(todoStore.todos).toHaveLength(3)
      expect(activityStore.activities).toHaveLength(1)
      expect(skillsStore.skills).toHaveLength(1)
    })
  })

  describe('memory management panel functionality', () => {
    it('supports full CRUD + filter workflow', () => {
      const store = useMemoryModuleStore()

      // Create: populate with diverse memories
      const memories = [
        createMemory({ id: 'pref-1', content: 'Likes dark mode', category: 'preference', importance: 9 }),
        createMemory({ id: 'event-1', content: 'Birthday party on March 5', category: 'event', importance: 8 }),
        createMemory({ id: 'habit-1', content: 'Morning coffee routine', category: 'habit', importance: 6 }),
        createMemory({ id: 'goal-1', content: 'Learn Rust by April', category: 'goal', importance: 7 }),
        createMemory({ id: 'emotion-1', content: 'Felt happy about promotion', category: 'emotion', importance: 8 }),
      ]
      store.setMemories(memories)
      expect(store.memoryCount).toBe(5)

      // Read: filter by category
      store.selectedCategory = 'preference'
      expect(store.filteredMemories).toHaveLength(1)
      expect(store.filteredMemories[0].id).toBe('pref-1')

      // Read: filter by search query
      store.selectedCategory = 'all'
      store.searchQuery = 'coffee'
      expect(store.filteredMemories).toHaveLength(1)
      expect(store.filteredMemories[0].id).toBe('habit-1')

      // Read: combined filter
      store.searchQuery = 'party'
      store.selectedCategory = 'event'
      expect(store.filteredMemories).toHaveLength(1)

      // Select
      store.searchQuery = ''
      store.selectedCategory = 'all'
      store.selectMemory('event-1')
      expect(store.selectedMemory?.id).toBe('event-1')

      // Delete: removes selected
      store.deleteMemory('event-1')
      expect(store.memoryCount).toBe(4)
      expect(store.selectedMemory).toBeNull() // Auto-cleared
    })
  })

  describe('todo panel functionality', () => {
    it('supports add, toggle, delete, filter workflow', () => {
      const store = useTodoModuleStore()

      // Add todos
      store.addTodo('Write integration tests')
      store.addTodo('Review PR')
      store.addTodo('Deploy to staging')
      expect(store.todos).toHaveLength(3)
      expect(store.activeCount).toBe(3)
      expect(store.completedCount).toBe(0)

      // Toggle complete
      const firstId = store.todos[0].id
      store.toggleTodo(firstId)
      expect(store.activeCount).toBe(2)
      expect(store.completedCount).toBe(1)

      // Filter
      store.filter = 'active'
      expect(store.filteredTodos).toHaveLength(2)

      store.filter = 'completed'
      expect(store.filteredTodos).toHaveLength(1)
      expect(store.filteredTodos[0].id).toBe(firstId)

      // Delete
      store.deleteTodo(firstId)
      expect(store.todos).toHaveLength(2)
      expect(store.completedCount).toBe(0)

      // Clear completed
      store.toggleTodo(store.todos[0].id)
      store.clearCompleted()
      expect(store.todos).toHaveLength(1)
    })
  })

  describe('activity timeline display', () => {
    it('stores and retrieves activity entries', () => {
      const store = useActivityModuleStore()

      const activities: ActivityEntryUI[] = [
        createActivity({ app: 'VS Code', durationMs: 7200000, description: 'Coding' }),
        createActivity({ app: 'Chrome', durationMs: 1800000, description: 'Research' }),
        createActivity({ app: 'VS Code', durationMs: 3600000, description: 'Testing' }),
        createActivity({ app: 'Slack', durationMs: 900000, description: 'Team chat' }),
      ]

      store.setActivities(activities)
      expect(store.activities).toHaveLength(4)

      // Without todaySummary, totalWorkDuration defaults to 0
      expect(store.totalWorkDuration).toBe(0)
    })

    it('computes work duration and breakdown from daily summary', () => {
      const store = useActivityModuleStore()

      const summary: DailySummaryUI = {
        date: '2026-02-21',
        highlights: ['Completed integration tests', 'Fixed critical bug'],
        activityBreakdown: [
          { app: 'VS Code', durationMs: 14400000, description: 'Development' },
          { app: 'Chrome', durationMs: 3600000, description: 'Research' },
        ],
        totalWorkDurationMs: 18000000,
        personalNote: 'Productive day!',
      }

      store.setSummary(summary)

      // totalWorkDuration comes from summary
      expect(store.totalWorkDuration).toBe(18000000)

      // appBreakdown comes from summary
      expect(store.appBreakdown).toHaveLength(2)
      const vscodeEntry = store.appBreakdown.find(b => b.app === 'VS Code')
      expect(vscodeEntry).toBeDefined()
      expect(vscodeEntry!.durationMs).toBe(14400000)

      // highlights come from summary
      expect(store.highlights).toHaveLength(2)
      expect(store.highlights[0]).toBe('Completed integration tests')
    })

    it('manages daily summary lifecycle', () => {
      const store = useActivityModuleStore()

      // Initially no summary
      expect(store.todaySummary).toBeNull()
      expect(store.totalWorkDuration).toBe(0)
      expect(store.appBreakdown).toEqual([])
      expect(store.highlights).toEqual([])

      // Set summary
      store.setSummary({
        date: '2026-02-21',
        highlights: ['Test'],
        activityBreakdown: [],
        totalWorkDurationMs: 5000,
        personalNote: '',
      })
      expect(store.todaySummary).toBeDefined()
      expect(store.totalWorkDuration).toBe(5000)

      // Reset clears summary
      store.resetState()
      expect(store.todaySummary).toBeNull()
      expect(store.totalWorkDuration).toBe(0)
    })
  })

  describe('skills panel functionality', () => {
    it('supports browse, toggle, search workflow', () => {
      const store = useSkillsModuleStore()

      const skills = [
        createSkill({ id: 'web-search', name: 'Web Search', category: 'search', tags: ['web', 'search'] }),
        createSkill({ id: 'file-manager', name: 'File Manager', category: 'filesystem', tags: ['files'] }),
        createSkill({ id: 'code-review', name: 'Code Review', category: 'development', tags: ['code', 'review'] }),
        createSkill({ id: 'memory-recall', name: 'Memory Recall', category: 'memory', tags: ['recall'] }),
      ]
      store.setSkills(skills)
      expect(store.skills).toHaveLength(4)
      expect(store.activeCount).toBe(0)

      // Activate skills
      store.toggleSkill('web-search')
      store.toggleSkill('code-review')
      expect(store.activeCount).toBe(2)

      // Search by name
      store.searchQuery = 'search'
      expect(store.filteredSkills).toHaveLength(1)
      expect(store.filteredSkills[0].id).toBe('web-search')

      // Search by tag
      store.searchQuery = 'code'
      expect(store.filteredSkills).toHaveLength(1)
      expect(store.filteredSkills[0].id).toBe('code-review')

      // Get by ID
      const skill = store.getSkillById('memory-recall')
      expect(skill).toBeDefined()
      expect(skill?.name).toBe('Memory Recall')

      // Deactivate
      store.toggleSkill('web-search')
      expect(store.activeCount).toBe(1)
    })
  })

  describe('reset state across all stores', () => {
    it('each store can be independently reset', () => {
      const memoryStore = useMemoryModuleStore()
      const todoStore = useTodoModuleStore()
      const activityStore = useActivityModuleStore()
      const skillsStore = useSkillsModuleStore()

      // Populate all
      memoryStore.setMemories([createMemory()])
      todoStore.addTodo('task 1')
      activityStore.setActivities([createActivity()])
      skillsStore.setSkills([createSkill()])

      // Reset all
      memoryStore.resetState()
      todoStore.resetState()
      activityStore.resetState()
      skillsStore.resetState()

      // All empty
      expect(memoryStore.memories).toEqual([])
      expect(todoStore.todos).toEqual([])
      expect(activityStore.activities).toEqual([])
      expect(skillsStore.skills).toEqual([])
    })
  })
})
