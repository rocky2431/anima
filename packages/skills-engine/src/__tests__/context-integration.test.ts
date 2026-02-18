import type { Skill } from '../types'

import { describe, expect, it } from 'vitest'

import { buildSkillsContext, extractLayer1, formatLayer1Summary, formatLayer2Body } from '../context-integration'

function makeSkill(overrides: Partial<Skill> & { metadata: Skill['metadata'] }): Skill {
  return {
    body: overrides.body ?? 'Default body content.',
    source: overrides.source ?? 'builtin',
    filePath: overrides.filePath ?? '/fake/path',
    metadata: overrides.metadata,
  }
}

const SKILL_A = makeSkill({
  metadata: {
    id: 'skill-a',
    name: 'Skill A',
    category: 'testing',
    version: '1.0.0',
    description: 'First test skill.',
  },
  body: '# Skill A\n\nDetailed instructions for skill A.',
})

const SKILL_B = makeSkill({
  metadata: {
    id: 'skill-b',
    name: 'Skill B',
    category: 'tools',
    version: '2.0.0',
    description: 'Second test skill with tools.',
    allowedTools: ['tool_x'],
  },
  body: '# Skill B\n\nDetailed instructions for skill B.',
})

describe('context-integration', () => {
  describe('extractLayer1', () => {
    it('extracts Layer 1 metadata from a skill', () => {
      const layer1 = extractLayer1(SKILL_A)

      expect(layer1.id).toBe('skill-a')
      expect(layer1.name).toBe('Skill A')
      expect(layer1.category).toBe('testing')
      expect(layer1.description).toBe('First test skill.')
    })

    it('only includes Layer 1 fields (no body, no version)', () => {
      const layer1 = extractLayer1(SKILL_A)
      const keys = Object.keys(layer1).sort()
      expect(keys).toEqual(['category', 'description', 'id', 'name'])
    })
  })

  describe('formatLayer1Summary', () => {
    it('produces a summary for a list of skills', () => {
      const summary = formatLayer1Summary([SKILL_A, SKILL_B])

      expect(summary).toContain('skill-a')
      expect(summary).toContain('Skill A')
      expect(summary).toContain('skill-b')
      expect(summary).toContain('Skill B')
    })

    it('produces summary under 200 tokens for 2 skills', () => {
      const summary = formatLayer1Summary([SKILL_A, SKILL_B])
      // Rough token estimate: ~4 chars per token
      const estimatedTokens = summary.length / 4
      expect(estimatedTokens).toBeLessThan(200)
    })

    it('returns empty string for empty skills list', () => {
      const summary = formatLayer1Summary([])
      expect(summary).toBe('')
    })
  })

  describe('formatLayer2Body', () => {
    it('includes full body content', () => {
      const body = formatLayer2Body(SKILL_A)
      expect(body).toContain('Detailed instructions for skill A.')
    })

    it('includes skill name header', () => {
      const body = formatLayer2Body(SKILL_A)
      expect(body).toContain('Skill A')
    })

    it('includes metadata context', () => {
      const body = formatLayer2Body(SKILL_B)
      expect(body).toContain('skill-b')
    })
  })

  describe('buildSkillsContext', () => {
    it('combines Layer 1 summary and Layer 2 bodies', () => {
      const context = buildSkillsContext([SKILL_A, SKILL_B], [SKILL_A])

      // Should contain Layer 1 summary mentioning both skills
      expect(context).toContain('skill-a')
      expect(context).toContain('skill-b')

      // Should contain Layer 2 body only for active skill
      expect(context).toContain('Detailed instructions for skill A.')
    })

    it('returns only Layer 1 when no skills are active', () => {
      const context = buildSkillsContext([SKILL_A, SKILL_B], [])

      expect(context).toContain('skill-a')
      expect(context).toContain('skill-b')
      // Should NOT contain full body
      expect(context).not.toContain('Detailed instructions for skill A.')
      expect(context).not.toContain('Detailed instructions for skill B.')
    })

    it('returns empty string when no skills exist', () => {
      const context = buildSkillsContext([], [])
      expect(context).toBe('')
    })
  })
})
