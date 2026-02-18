/**
 * SKILL.md frontmatter metadata (YAML section).
 */
export interface SkillMetadata {
  readonly id: string
  readonly name: string
  readonly category: string
  readonly version: string
  readonly description: string
  readonly allowedTools?: string[]
  readonly dependencies?: string[]
  readonly tags?: string[]
}

/**
 * Layer 1: Lightweight metadata summary for system prompt injection.
 */
export interface SkillLayer1 {
  readonly id: string
  readonly name: string
  readonly category: string
  readonly description: string
}

/**
 * Source of a skill (built-in or user).
 */
export type SkillSource = 'builtin' | 'user'

/**
 * Full skill representation with all layers resolved.
 */
export interface Skill {
  readonly metadata: SkillMetadata
  readonly body: string
  readonly source: SkillSource
  readonly filePath: string
}

/**
 * Registry entry with activation state.
 * Internal mutable version used by SkillRegistry.
 */
export interface MutableRegistryEntry {
  skill: Skill
  active: boolean
}

/**
 * Read-only registry entry exposed to consumers.
 */
export interface SkillRegistryEntry {
  readonly skill: Skill
  readonly active: boolean
}

/**
 * Result of skill discovery, including both loaded skills and errors.
 */
export interface DiscoverResult {
  readonly skills: Skill[]
  readonly errors: Array<{ dir: string, error: Error }>
}

/**
 * Configuration for the skills engine.
 */
export interface SkillsEngineConfig {
  readonly builtinSkillsDir: string
  readonly userSkillsDir: string
}
