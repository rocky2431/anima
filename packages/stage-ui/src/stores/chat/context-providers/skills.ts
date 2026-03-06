import type { ContextMessage } from '../../../types/chat'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { nanoid } from 'nanoid'

import { useSkillsModuleStore } from '../../modules/skills'

const SKILLS_CONTEXT_ID = 'system:skills'

/**
 * Creates a context message containing the active skills summary.
 * Injected before each chat message so the LLM knows which skills are available.
 */
export function createSkillsContext(): ContextMessage | null {
  const skillsStore = useSkillsModuleStore()
  const skills = skillsStore.skills

  if (skills.length === 0) {
    return null
  }

  const activeSkills = skills.filter(s => s.active)
  const inactiveSkills = skills.filter(s => !s.active)

  const lines: string[] = []
  lines.push(`Available skills (${activeSkills.length} active / ${skills.length} total):`)

  if (activeSkills.length > 0) {
    lines.push('Active:')
    for (const skill of activeSkills) {
      lines.push(`  - ${skill.name}: ${skill.description}`)
    }
  }

  if (inactiveSkills.length > 0) {
    lines.push('Inactive:')
    for (const skill of inactiveSkills) {
      lines.push(`  - ${skill.name}: ${skill.description}`)
    }
  }

  return {
    id: nanoid(),
    contextId: SKILLS_CONTEXT_ID,
    strategy: ContextUpdateStrategy.ReplaceSelf,
    text: lines.join('\n'),
    createdAt: Date.now(),
  }
}
