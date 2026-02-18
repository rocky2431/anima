import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { SkillRegistry } from '../skill-registry'

function writeSkillMd(dir: string, id: string, opts?: { category?: string, description?: string }): void {
  const skillDir = path.join(dir, id)
  fs.mkdirSync(skillDir, { recursive: true })
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `---
id: ${id}
name: ${id.charAt(0).toUpperCase() + id.slice(1)}
category: ${opts?.category ?? 'general'}
version: 1.0.0
description: ${opts?.description ?? `Skill ${id}.`}
---

# ${id}

Body content for ${id}.
`)
}

describe('skillRegistry', () => {
  let tmpBuiltin: string
  let tmpUser: string

  beforeEach(() => {
    tmpBuiltin = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-reg-builtin-'))
    tmpUser = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-reg-user-'))
  })

  afterEach(() => {
    fs.rmSync(tmpBuiltin, { recursive: true, force: true })
    fs.rmSync(tmpUser, { recursive: true, force: true })
  })

  it('creates a registry with config', () => {
    const registry = new SkillRegistry({
      builtinSkillsDir: tmpBuiltin,
      userSkillsDir: tmpUser,
    })
    expect(registry).toBeDefined()
  })

  it('loads built-in skills', async () => {
    writeSkillMd(tmpBuiltin, 'builtin-skill')

    const registry = new SkillRegistry({
      builtinSkillsDir: tmpBuiltin,
      userSkillsDir: tmpUser,
    })
    await registry.loadAll()

    const all = registry.getAll()
    expect(all).toHaveLength(1)
    expect(all[0].skill.metadata.id).toBe('builtin-skill')
    expect(all[0].skill.source).toBe('builtin')
  })

  it('loads user skills', async () => {
    writeSkillMd(tmpUser, 'user-skill')

    const registry = new SkillRegistry({
      builtinSkillsDir: tmpBuiltin,
      userSkillsDir: tmpUser,
    })
    await registry.loadAll()

    const all = registry.getAll()
    expect(all).toHaveLength(1)
    expect(all[0].skill.source).toBe('user')
  })

  it('merges built-in and user skills', async () => {
    writeSkillMd(tmpBuiltin, 'builtin-one')
    writeSkillMd(tmpBuiltin, 'builtin-two')
    writeSkillMd(tmpUser, 'user-one')

    const registry = new SkillRegistry({
      builtinSkillsDir: tmpBuiltin,
      userSkillsDir: tmpUser,
    })
    await registry.loadAll()

    const all = registry.getAll()
    expect(all).toHaveLength(3)

    const builtinCount = all.filter(e => e.skill.source === 'builtin').length
    const userCount = all.filter(e => e.skill.source === 'user').length
    expect(builtinCount).toBe(2)
    expect(userCount).toBe(1)
  })

  it('user skill overrides built-in with same ID', async () => {
    writeSkillMd(tmpBuiltin, 'shared-skill', { description: 'Builtin version.' })
    writeSkillMd(tmpUser, 'shared-skill', { description: 'User override.' })

    const registry = new SkillRegistry({
      builtinSkillsDir: tmpBuiltin,
      userSkillsDir: tmpUser,
    })
    await registry.loadAll()

    const all = registry.getAll()
    expect(all).toHaveLength(1)

    const entry = registry.getById('shared-skill')
    expect(entry).toBeDefined()
    expect(entry!.skill.source).toBe('user')
    expect(entry!.skill.metadata.description).toBe('User override.')
  })

  describe('getById', () => {
    it('returns entry for existing skill', async () => {
      writeSkillMd(tmpBuiltin, 'find-me')

      const registry = new SkillRegistry({
        builtinSkillsDir: tmpBuiltin,
        userSkillsDir: tmpUser,
      })
      await registry.loadAll()

      const entry = registry.getById('find-me')
      expect(entry).toBeDefined()
      expect(entry!.skill.metadata.id).toBe('find-me')
    })

    it('returns undefined for nonexistent skill', async () => {
      const registry = new SkillRegistry({
        builtinSkillsDir: tmpBuiltin,
        userSkillsDir: tmpUser,
      })
      await registry.loadAll()

      expect(registry.getById('nope')).toBeUndefined()
    })
  })

  describe('activate / deactivate', () => {
    it('skills start as inactive', async () => {
      writeSkillMd(tmpBuiltin, 'my-skill')

      const registry = new SkillRegistry({
        builtinSkillsDir: tmpBuiltin,
        userSkillsDir: tmpUser,
      })
      await registry.loadAll()

      const entry = registry.getById('my-skill')
      expect(entry!.active).toBe(false)
    })

    it('activates a skill by ID', async () => {
      writeSkillMd(tmpBuiltin, 'activate-me')

      const registry = new SkillRegistry({
        builtinSkillsDir: tmpBuiltin,
        userSkillsDir: tmpUser,
      })
      await registry.loadAll()

      const result = registry.activate('activate-me')
      expect(result).toBe(true)

      const entry = registry.getById('activate-me')
      expect(entry!.active).toBe(true)
    })

    it('returns false when activating nonexistent skill', async () => {
      const registry = new SkillRegistry({
        builtinSkillsDir: tmpBuiltin,
        userSkillsDir: tmpUser,
      })
      await registry.loadAll()

      expect(registry.activate('nope')).toBe(false)
    })

    it('deactivates an active skill', async () => {
      writeSkillMd(tmpBuiltin, 'toggle-me')

      const registry = new SkillRegistry({
        builtinSkillsDir: tmpBuiltin,
        userSkillsDir: tmpUser,
      })
      await registry.loadAll()

      registry.activate('toggle-me')
      expect(registry.getById('toggle-me')!.active).toBe(true)

      const result = registry.deactivate('toggle-me')
      expect(result).toBe(true)
      expect(registry.getById('toggle-me')!.active).toBe(false)
    })

    it('returns false when deactivating nonexistent skill', async () => {
      const registry = new SkillRegistry({
        builtinSkillsDir: tmpBuiltin,
        userSkillsDir: tmpUser,
      })
      await registry.loadAll()

      expect(registry.deactivate('nope')).toBe(false)
    })
  })

  describe('getActive', () => {
    it('returns only active skills', async () => {
      writeSkillMd(tmpBuiltin, 'active-one')
      writeSkillMd(tmpBuiltin, 'inactive-one')
      writeSkillMd(tmpBuiltin, 'active-two')

      const registry = new SkillRegistry({
        builtinSkillsDir: tmpBuiltin,
        userSkillsDir: tmpUser,
      })
      await registry.loadAll()

      registry.activate('active-one')
      registry.activate('active-two')

      const active = registry.getActive()
      expect(active).toHaveLength(2)
      const ids = active.map(s => s.metadata.id).sort()
      expect(ids).toEqual(['active-one', 'active-two'])
    })

    it('returns empty array when no skills are active', async () => {
      writeSkillMd(tmpBuiltin, 'some-skill')

      const registry = new SkillRegistry({
        builtinSkillsDir: tmpBuiltin,
        userSkillsDir: tmpUser,
      })
      await registry.loadAll()

      expect(registry.getActive()).toEqual([])
    })
  })

  it('handles nonexistent user skills directory gracefully', async () => {
    const registry = new SkillRegistry({
      builtinSkillsDir: tmpBuiltin,
      userSkillsDir: '/nonexistent/user/skills',
    })

    await expect(registry.loadAll()).resolves.not.toThrow()
  })
})
