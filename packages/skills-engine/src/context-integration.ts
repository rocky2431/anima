import type { Skill, SkillLayer1 } from './types'

/**
 * Extract Layer 1 data from a skill.
 * Only includes lightweight metadata fields.
 */
export function extractLayer1(skill: Skill): SkillLayer1 {
  return {
    id: skill.metadata.id,
    name: skill.metadata.name,
    category: skill.metadata.category,
    description: skill.metadata.description,
  }
}

/**
 * Generate Layer 1 metadata summary for system prompt injection.
 * Produces a compact summary (<200 tokens) of available skills.
 */
export function formatLayer1Summary(skills: Skill[]): string {
  if (skills.length === 0) {
    return ''
  }

  const lines = skills.map((skill) => {
    const layer1 = extractLayer1(skill)
    return `- [${layer1.id}] ${layer1.name} (${layer1.category}): ${layer1.description}`
  })

  return `## Available Skills\n${lines.join('\n')}`
}

/**
 * Generate Layer 2 full body for an active skill.
 * Includes skill identifier + complete instructions.
 */
export function formatLayer2Body(skill: Skill): string {
  return `### Skill: ${skill.metadata.name} [${skill.metadata.id}]\n\n${skill.body}`
}

/**
 * Build the complete skills context block for system prompt injection.
 * Combines Layer 1 summary of all skills + Layer 2 bodies of active skills.
 */
export function buildSkillsContext(allSkills: Skill[], activeSkills: Skill[]): string {
  if (allSkills.length === 0) {
    return ''
  }

  const parts: string[] = []

  parts.push(formatLayer1Summary(allSkills))

  if (activeSkills.length > 0) {
    parts.push('\n## Active Skill Instructions')
    for (const skill of activeSkills) {
      parts.push(formatLayer2Body(skill))
    }
  }

  return parts.join('\n')
}
