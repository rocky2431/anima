import * as path from 'node:path'
import * as url from 'node:url'

import { describe, expect, it } from 'vitest'

import { buildSkillsContext } from '../context-integration'
import { SkillRegistry } from '../skill-registry'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const BUILTIN_SKILLS_DIR = path.resolve(__dirname, '../../skills')

describe('skills-engine integration', () => {
  it('loads real built-in skills, activates one, and builds context', async () => {
    const registry = new SkillRegistry({
      builtinSkillsDir: BUILTIN_SKILLS_DIR,
      userSkillsDir: '/nonexistent/user/skills',
    })

    await registry.loadAll()

    const all = registry.getAll()
    expect(all.length).toBeGreaterThanOrEqual(2)

    const companionEntry = registry.getById('companion-persona')
    expect(companionEntry).toBeDefined()
    expect(companionEntry!.skill.source).toBe('builtin')

    const proactiveEntry = registry.getById('proactive-care')
    expect(proactiveEntry).toBeDefined()

    registry.activate('companion-persona')

    const allSkills = all.map(e => e.skill)
    const activeSkills = registry.getActive()

    const context = buildSkillsContext(allSkills, activeSkills)

    // Layer 1: both skills mentioned in summary
    expect(context).toContain('companion-persona')
    expect(context).toContain('proactive-care')

    // Layer 2: only companion-persona body included (it's the active one)
    expect(context).toContain('warm, caring AI companion')
    expect(context).not.toContain('Morning Greeting')
  })

  it('user skills override built-in skills with same ID', async () => {
    const registry = new SkillRegistry({
      builtinSkillsDir: BUILTIN_SKILLS_DIR,
      userSkillsDir: BUILTIN_SKILLS_DIR, // same dir to test override (later entries win)
    })

    await registry.loadAll()

    const entry = registry.getById('companion-persona')
    expect(entry).toBeDefined()
    // User source wins since it loads after builtin
    expect(entry!.skill.source).toBe('user')
  })

  it('loadAll resets activation state', async () => {
    const registry = new SkillRegistry({
      builtinSkillsDir: BUILTIN_SKILLS_DIR,
      userSkillsDir: '/nonexistent/user/skills',
    })

    await registry.loadAll()
    registry.activate('companion-persona')
    expect(registry.getById('companion-persona')!.active).toBe(true)

    await registry.loadAll()
    expect(registry.getById('companion-persona')!.active).toBe(false)
  })
})
