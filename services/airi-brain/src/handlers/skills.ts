import type { Client } from '@proj-airi/server-sdk'

import { useLogg } from '@guiiai/logg'

interface SkillEntry {
  id: string
  name: string
  category: string
  version: string
  description: string
  source: 'builtin' | 'user'
  tags: string[]
  active: boolean
}

const log = useLogg('brain:skills').useGlobalConfig()

/**
 * In-memory skill registry. In production backed by skills-engine's SkillRegistry.
 * Walking skeleton provides a static list of built-in skills.
 */
const skills: Map<string, SkillEntry> = new Map()

// Seed built-in skills
const builtinSkills: SkillEntry[] = [
  { id: 'web-search', name: 'Web Search', category: 'information', version: '1.0.0', description: 'Search the web for information', source: 'builtin', tags: ['search', 'web'], active: true },
  { id: 'code-analysis', name: 'Code Analysis', category: 'development', version: '1.0.0', description: 'Analyze and explain code snippets', source: 'builtin', tags: ['code', 'analysis'], active: true },
  { id: 'calendar-management', name: 'Calendar Management', category: 'productivity', version: '1.0.0', description: 'Manage calendar events and reminders', source: 'builtin', tags: ['calendar', 'schedule'], active: false },
  { id: 'email-compose', name: 'Email Compose', category: 'communication', version: '1.0.0', description: 'Help compose and review emails', source: 'builtin', tags: ['email', 'writing'], active: false },
  { id: 'file-monitor', name: 'File Monitor', category: 'system', version: '1.0.0', description: 'Monitor file system changes', source: 'builtin', tags: ['files', 'monitor'], active: true },
]

for (const skill of builtinSkills) {
  skills.set(skill.id, skill)
}

function broadcastList(client: Client): void {
  client.send({
    type: 'skills:list',
    data: {
      skills: Array.from(skills.values()),
    },
  })
}

export function registerSkillsHandler(client: Client): void {
  client.onEvent('skills:list', () => {
    log.info('Received skills:list request')
    broadcastList(client)
  })

  client.onEvent('skills:toggle', (event) => {
    const { id, active } = event.data as { id: string, active: boolean }
    const skill = skills.get(id)
    if (!skill) {
      log.warn('Skill not found', { id })
      client.send({
        type: 'skills:toggled',
        data: { id, active: false, success: false },
      })
      return
    }

    skill.active = active
    log.info('Toggled skill', { id, active })

    client.send({
      type: 'skills:toggled',
      data: { id, active, success: true },
    })
  })
}
