import type { SkillUI } from '../../types/memory'

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export const useSkillsModuleStore = defineStore('skills-module', () => {
  const skills = ref<SkillUI[]>([])
  const searchQuery = ref('')

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
    skills.value = skills.value.map((s) => {
      if (s.id !== id) {
        return s
      }
      return { ...s, active: !s.active }
    })
  }

  function getSkillById(id: string): SkillUI | undefined {
    return skills.value.find(s => s.id === id)
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
    resetState,
  }
})
