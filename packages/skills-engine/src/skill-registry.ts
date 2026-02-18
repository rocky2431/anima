import type { MutableRegistryEntry, Skill, SkillRegistryEntry, SkillsEngineConfig } from './types'

import { discoverSkills } from './skill-loader'

/**
 * Skills registry that manages built-in and user skills.
 * User skills override built-in skills with the same ID.
 */
export class SkillRegistry {
  private entries = new Map<string, MutableRegistryEntry>()
  private config: SkillsEngineConfig

  constructor(config: SkillsEngineConfig) {
    this.config = config
  }

  /**
   * Load and register all skills from built-in and user directories.
   */
  async loadAll(): Promise<void> {
    this.entries.clear()

    const builtin = await discoverSkills(this.config.builtinSkillsDir, 'builtin')
    for (const skill of builtin.skills) {
      this.entries.set(skill.metadata.id, { skill, active: false })
    }

    const user = await discoverSkills(this.config.userSkillsDir, 'user')
    for (const skill of user.skills) {
      this.entries.set(skill.metadata.id, { skill, active: false })
    }
  }

  getAll(): SkillRegistryEntry[] {
    return [...this.entries.values()].map(e => ({ skill: e.skill, active: e.active }))
  }

  getById(id: string): SkillRegistryEntry | undefined {
    const entry = this.entries.get(id)
    if (!entry) {
      return undefined
    }
    return { skill: entry.skill, active: entry.active }
  }

  activate(id: string): boolean {
    const entry = this.entries.get(id)
    if (!entry) {
      return false
    }
    entry.active = true
    return true
  }

  deactivate(id: string): boolean {
    const entry = this.entries.get(id)
    if (!entry) {
      return false
    }
    entry.active = false
    return true
  }

  getActive(): Skill[] {
    return [...this.entries.values()]
      .filter(e => e.active)
      .map(e => e.skill)
  }
}
