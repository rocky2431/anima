import type { SkillUI } from '../../types/memory'

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { useModsServerChannelStore } from '../mods/api/channel-server'

export const useSkillsModuleStore = defineStore('skills-module', () => {
  const skills = ref<SkillUI[]>([])
  const searchQuery = ref('')
  const disposers = ref<Array<() => void>>([])

  const filteredSkills = computed(() => {
    if (!searchQuery.value.trim()) {
      return skills.value
    }

    const query = searchQuery.value.toLowerCase()
    return skills.value.filter((s) => {
      return (
        s.name.toLowerCase().includes(query)
        || s.description.toLowerCase().includes(query)
        || s.tags.some(tag => tag.toLowerCase().includes(query))
      )
    })
  })

  const activeCount = computed(() => skills.value.filter(s => s.active).length)

  function setSkills(entries: SkillUI[]): void {
    skills.value = [...entries]
  }

  function toggleSkill(id: string): void {
    const target = skills.value.find(s => s.id === id)
    if (!target)
      return

    const newActive = !target.active

    // Optimistic update
    skills.value = skills.value.map((s) => {
      if (s.id !== id)
        return s
      return { ...s, active: newActive }
    })

    // Send to backend
    const serverChannel = useModsServerChannelStore()
    serverChannel.send({ type: 'skills:toggle', data: { id, active: newActive } })
  }

  function getSkillById(id: string): SkillUI | undefined {
    return skills.value.find(s => s.id === id)
  }

  /**
   * Initialize WebSocket subscriptions and request initial skill list.
   */
  function initialize(): void {
    const serverChannel = useModsServerChannelStore()

    disposers.value.push(
      serverChannel.onEvent('skills:list', (event) => {
        setSkills(event.data.skills)
      }),
    )

    disposers.value.push(
      serverChannel.onEvent('skills:toggled', (event) => {
        const { id, active, success } = event.data
        if (!success) {
          // Revert optimistic update on failure
          skills.value = skills.value.map((s) => {
            if (s.id !== id)
              return s
            return { ...s, active: !active }
          })
        }
      }),
    )

    // Request initial list from backend
    serverChannel.send({ type: 'skills:list', data: { skills: [] } })
  }

  function dispose(): void {
    for (const d of disposers.value) {
      d()
    }
    disposers.value = []
  }

  function resetState(): void {
    skills.value = []
    searchQuery.value = ''
  }

  return {
    skills,
    searchQuery,
    filteredSkills,
    activeCount,
    setSkills,
    toggleSkill,
    getSkillById,
    initialize,
    dispose,
    resetState,
  }
})
