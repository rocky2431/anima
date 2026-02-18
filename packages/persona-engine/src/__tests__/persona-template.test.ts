import type { PersonaTemplate } from '../types'

import { describe, expect, it } from 'vitest'

import { getPersonaTemplate, PERSONA_TEMPLATES } from '../persona-template'

describe('persona templates', () => {
  describe('pERSONA_TEMPLATES', () => {
    it('contains exactly 3 preset templates', () => {
      expect(PERSONA_TEMPLATES).toHaveLength(3)
    })

    it('includes 小柔 (Xiaorou) template', () => {
      const xiaorou = PERSONA_TEMPLATES.find(t => t.id === 'xiaorou')
      expect(xiaorou).toBeDefined()
      expect(xiaorou!.name).toBe('小柔')
    })

    it('includes Aria template', () => {
      const aria = PERSONA_TEMPLATES.find(t => t.id === 'aria')
      expect(aria).toBeDefined()
      expect(aria!.name).toBe('Aria')
    })

    it('includes Mochi template', () => {
      const mochi = PERSONA_TEMPLATES.find(t => t.id === 'mochi')
      expect(mochi).toBeDefined()
      expect(mochi!.name).toBe('Mochi')
    })
  })

  describe('template structure', () => {
    it('every template has required fields', () => {
      for (const template of PERSONA_TEMPLATES) {
        expect(template.id).toBeTruthy()
        expect(template.name).toBeTruthy()
        expect(template.personality).toBeTruthy()
        expect(template.speakingStyle).toBeTruthy()
        expect(template.defaultEmotion).toBeTruthy()
      }
    })

    it('every template defaultEmotion is a valid PersonaEmotion', () => {
      const validEmotions = ['idle', 'curious', 'caring', 'worried', 'sleepy', 'excited']
      for (const template of PERSONA_TEMPLATES) {
        expect(validEmotions).toContain(template.defaultEmotion)
      }
    })
  })

  describe('getPersonaTemplate', () => {
    it('retrieves template by ID', () => {
      const template = getPersonaTemplate('xiaorou')
      expect(template).toBeDefined()
      expect(template!.id).toBe('xiaorou')
    })

    it('returns undefined for unknown ID', () => {
      const template = getPersonaTemplate('nonexistent')
      expect(template).toBeUndefined()
    })

    it('returns a typed PersonaTemplate', () => {
      const template: PersonaTemplate | undefined = getPersonaTemplate('aria')
      expect(template).toBeDefined()
    })
  })
})
