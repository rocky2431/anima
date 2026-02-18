import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { discoverSkills, loadSkillFromDir, parseSkillMd, validateMetadata } from '../skill-loader'

const VALID_SKILL_MD = `---
id: test-skill
name: Test Skill
category: testing
version: 1.0.0
description: A test skill for validation.
tags:
  - test
  - example
allowedTools:
  - tool_a
  - tool_b
dependencies:
  - companion-persona
---

# Test Skill

This is the body of the test skill with instructions.

## Section 1

Some instructions here.
`

const MINIMAL_SKILL_MD = `---
id: minimal
name: Minimal Skill
category: general
version: 0.1.0
description: Minimal skill with only required fields.
---

Basic body content.
`

describe('skill-loader', () => {
  describe('parseSkillMd', () => {
    it('parses valid SKILL.md with all frontmatter fields', () => {
      const skill = parseSkillMd(VALID_SKILL_MD, 'builtin', '/fake/path/test-skill/SKILL.md')

      expect(skill.metadata.id).toBe('test-skill')
      expect(skill.metadata.name).toBe('Test Skill')
      expect(skill.metadata.category).toBe('testing')
      expect(skill.metadata.version).toBe('1.0.0')
      expect(skill.metadata.description).toBe('A test skill for validation.')
      expect(skill.metadata.tags).toEqual(['test', 'example'])
      expect(skill.metadata.allowedTools).toEqual(['tool_a', 'tool_b'])
      expect(skill.metadata.dependencies).toEqual(['companion-persona'])
      expect(skill.source).toBe('builtin')
      expect(skill.filePath).toBe('/fake/path/test-skill/SKILL.md')
    })

    it('parses minimal SKILL.md with only required fields', () => {
      const skill = parseSkillMd(MINIMAL_SKILL_MD, 'user', '/fake/path/minimal/SKILL.md')

      expect(skill.metadata.id).toBe('minimal')
      expect(skill.metadata.name).toBe('Minimal Skill')
      expect(skill.metadata.category).toBe('general')
      expect(skill.metadata.version).toBe('0.1.0')
      expect(skill.metadata.description).toBe('Minimal skill with only required fields.')
      expect(skill.metadata.allowedTools).toBeUndefined()
      expect(skill.metadata.dependencies).toBeUndefined()
      expect(skill.metadata.tags).toBeUndefined()
      expect(skill.body).toContain('Basic body content.')
    })

    it('preserves body content including markdown formatting', () => {
      const skill = parseSkillMd(VALID_SKILL_MD, 'builtin', '/fake/path')

      expect(skill.body).toContain('# Test Skill')
      expect(skill.body).toContain('## Section 1')
      expect(skill.body).toContain('Some instructions here.')
    })

    it('throws with filePath on missing required frontmatter field (id)', () => {
      const badMd = `---
name: No ID Skill
category: test
version: 1.0.0
description: Missing id field.
---

Body.
`
      expect(() => parseSkillMd(badMd, 'builtin', '/fake/bad.md')).toThrow(/missing required fields.*\/fake\/bad\.md/)
    })

    it('throws with filePath on empty content', () => {
      expect(() => parseSkillMd('', 'builtin', '/fake/empty.md')).toThrow(/empty.*\/fake\/empty\.md/)
    })

    it('throws with filePath on content without frontmatter', () => {
      expect(() => parseSkillMd('# Just a heading\n\nNo frontmatter.', 'builtin', '/fake/no-fm.md'))
        .toThrow(/frontmatter.*\/fake\/no-fm\.md/)
    })
  })

  describe('validateMetadata', () => {
    it('returns true for valid metadata', () => {
      const valid = {
        id: 'test',
        name: 'Test',
        category: 'cat',
        version: '1.0.0',
        description: 'desc',
      }
      expect(validateMetadata(valid)).toBe(true)
    })

    it('returns false for null', () => {
      expect(validateMetadata(null)).toBe(false)
    })

    it('returns false for missing required fields', () => {
      expect(validateMetadata({ id: 'test' })).toBe(false)
      expect(validateMetadata({ id: 'test', name: 'Test' })).toBe(false)
      expect(validateMetadata({})).toBe(false)
    })

    it('returns false for non-string field values', () => {
      expect(validateMetadata({
        id: 123,
        name: 'Test',
        category: 'cat',
        version: '1.0.0',
        description: 'desc',
      })).toBe(false)
    })
  })

  describe('loadSkillFromDir', () => {
    let tmpDir: string

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-loader-test-'))
    })

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    it('loads a skill from a directory containing SKILL.md', async () => {
      const skillDir = path.join(tmpDir, 'my-skill')
      fs.mkdirSync(skillDir)
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), VALID_SKILL_MD)

      const skill = await loadSkillFromDir(skillDir, 'builtin')

      expect(skill.metadata.id).toBe('test-skill')
      expect(skill.source).toBe('builtin')
      expect(skill.filePath).toBe(path.join(skillDir, 'SKILL.md'))
    })

    it('throws when directory does not contain SKILL.md', async () => {
      const emptyDir = path.join(tmpDir, 'empty-skill')
      fs.mkdirSync(emptyDir)

      await expect(loadSkillFromDir(emptyDir, 'user')).rejects.toThrow(/Failed to read/)
    })

    it('throws when directory does not exist', async () => {
      await expect(loadSkillFromDir('/nonexistent/path', 'user')).rejects.toThrow(/Failed to read/)
    })
  })

  describe('discoverSkills', () => {
    let tmpDir: string

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-discover-test-'))
    })

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    it('discovers multiple skills in subdirectories', async () => {
      const skill1Dir = path.join(tmpDir, 'skill-one')
      const skill2Dir = path.join(tmpDir, 'skill-two')
      fs.mkdirSync(skill1Dir)
      fs.mkdirSync(skill2Dir)

      fs.writeFileSync(path.join(skill1Dir, 'SKILL.md'), `---
id: skill-one
name: Skill One
category: test
version: 1.0.0
description: First skill.
---

Body one.
`)

      fs.writeFileSync(path.join(skill2Dir, 'SKILL.md'), `---
id: skill-two
name: Skill Two
category: test
version: 1.0.0
description: Second skill.
---

Body two.
`)

      const result = await discoverSkills(tmpDir, 'builtin')

      expect(result.skills).toHaveLength(2)
      expect(result.errors).toHaveLength(0)
      const ids = result.skills.map(s => s.metadata.id).sort()
      expect(ids).toEqual(['skill-one', 'skill-two'])
    })

    it('ignores directories without SKILL.md', async () => {
      const validDir = path.join(tmpDir, 'valid')
      const invalidDir = path.join(tmpDir, 'invalid')
      fs.mkdirSync(validDir)
      fs.mkdirSync(invalidDir)

      fs.writeFileSync(path.join(validDir, 'SKILL.md'), MINIMAL_SKILL_MD)
      fs.writeFileSync(path.join(invalidDir, 'README.md'), '# Not a skill')

      const result = await discoverSkills(tmpDir, 'user')

      expect(result.skills).toHaveLength(1)
      expect(result.skills[0].metadata.id).toBe('minimal')
    })

    it('returns empty result for nonexistent directory', async () => {
      const result = await discoverSkills('/nonexistent/path', 'user')
      expect(result.skills).toEqual([])
      expect(result.errors).toEqual([])
    })

    it('returns empty result for empty directory', async () => {
      const result = await discoverSkills(tmpDir, 'user')
      expect(result.skills).toEqual([])
      expect(result.errors).toEqual([])
    })

    it('reports errors for malformed SKILL.md while loading valid ones', async () => {
      const validDir = path.join(tmpDir, 'good-skill')
      const badDir = path.join(tmpDir, 'bad-skill')
      fs.mkdirSync(validDir)
      fs.mkdirSync(badDir)

      fs.writeFileSync(path.join(validDir, 'SKILL.md'), MINIMAL_SKILL_MD)
      fs.writeFileSync(path.join(badDir, 'SKILL.md'), `---
name: Missing ID
category: test
---

No id field.
`)

      const result = await discoverSkills(tmpDir, 'builtin')

      expect(result.skills).toHaveLength(1)
      expect(result.skills[0].metadata.id).toBe('minimal')
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].dir).toBe('bad-skill')
    })
  })
})
