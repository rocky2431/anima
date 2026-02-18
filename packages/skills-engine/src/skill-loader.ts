import type { DiscoverResult, Skill, SkillMetadata, SkillSource } from './types'

import * as fs from 'node:fs/promises'
import * as path from 'node:path'

import matter from 'gray-matter'

const REQUIRED_FIELDS: (keyof SkillMetadata)[] = ['id', 'name', 'category', 'version', 'description']

/**
 * Validate that skill metadata has all required fields.
 */
export function validateMetadata(metadata: unknown): metadata is SkillMetadata {
  if (metadata == null || typeof metadata !== 'object') {
    return false
  }

  const record = metadata as Record<string, unknown>
  for (const field of REQUIRED_FIELDS) {
    if (typeof record[field] !== 'string' || record[field] === '') {
      return false
    }
  }

  return true
}

/**
 * Parse a SKILL.md file content into structured Skill data.
 */
export function parseSkillMd(content: string, source: SkillSource, filePath: string): Skill {
  if (!content || content.trim() === '') {
    throw new Error(`SKILL.md content is empty: ${filePath}`)
  }

  const parsed = matter(content)

  if (!parsed.data || Object.keys(parsed.data).length === 0) {
    throw new Error(`SKILL.md is missing YAML frontmatter: ${filePath}`)
  }

  if (!validateMetadata(parsed.data)) {
    const missing = REQUIRED_FIELDS.filter(f => typeof (parsed.data as Record<string, unknown>)[f] !== 'string')
    throw new Error(`SKILL.md metadata missing required fields [${missing.join(', ')}]: ${filePath}`)
  }

  const metadata: SkillMetadata = {
    id: parsed.data.id,
    name: parsed.data.name,
    category: parsed.data.category,
    version: parsed.data.version,
    description: parsed.data.description,
    ...(Array.isArray(parsed.data.allowedTools) && { allowedTools: parsed.data.allowedTools }),
    ...(Array.isArray(parsed.data.dependencies) && { dependencies: parsed.data.dependencies }),
    ...(Array.isArray(parsed.data.tags) && { tags: parsed.data.tags }),
  }

  return {
    metadata,
    body: parsed.content.trim(),
    source,
    filePath,
  }
}

/**
 * Load a SKILL.md from a directory path.
 * Expects the directory to contain a SKILL.md file.
 */
export async function loadSkillFromDir(dirPath: string, source: SkillSource): Promise<Skill> {
  const skillPath = path.join(dirPath, 'SKILL.md')

  let content: string
  try {
    content = await fs.readFile(skillPath, 'utf-8')
  }
  catch (err) {
    throw new Error(`Failed to read SKILL.md at ${skillPath}: ${(err as Error).message}`)
  }

  return parseSkillMd(content, source, skillPath)
}

/**
 * Discover all skills in a directory by scanning subdirectories for SKILL.md files.
 * Returns both successfully loaded skills and errors for diagnostics.
 * Non-existent directory (ENOENT) is treated as empty; other errors propagate.
 */
export async function discoverSkills(baseDir: string, source: SkillSource): Promise<DiscoverResult> {
  let dirEntries: import('node:fs').Dirent[]
  try {
    dirEntries = await fs.readdir(baseDir, { withFileTypes: true }) as unknown as import('node:fs').Dirent[]
  }
  catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { skills: [], errors: [] }
    }
    throw new Error(`Failed to read skills directory ${baseDir}: ${(err as Error).message}`)
  }

  const skills: Skill[] = []
  const errors: Array<{ dir: string, error: Error }> = []

  for (const entry of dirEntries) {
    if (!entry.isDirectory()) {
      continue
    }

    const dirName = String(entry.name)
    const skillPath = path.join(baseDir, dirName, 'SKILL.md')
    try {
      await fs.access(skillPath)
    }
    catch {
      continue
    }

    try {
      const skill = await loadSkillFromDir(path.join(baseDir, dirName), source)
      skills.push(skill)
    }
    catch (err) {
      errors.push({ dir: dirName, error: err as Error })
    }
  }

  return { skills, errors }
}
