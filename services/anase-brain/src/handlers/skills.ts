import type { Client } from '@anase/server-sdk'
import type { SkillRegistryEntry } from '@anase/skills-engine'

import type { BrainStore } from '../store'

import { useLogg } from '@guiiai/logg'
import { buildSkillsContext, SkillRegistry } from '@anase/skills-engine'

const log = useLogg('brain:skills').useGlobalConfig()

let registry: SkillRegistry | null = null

function mapToEventFormat(entry: SkillRegistryEntry) {
  return {
    id: entry.skill.metadata.id,
    name: entry.skill.metadata.name,
    category: entry.skill.metadata.category,
    version: entry.skill.metadata.version,
    description: entry.skill.metadata.description,
    source: entry.skill.source,
    tags: entry.skill.metadata.tags ?? [],
    active: entry.active,
  }
}

function broadcastList(client: Client): void {
  if (!registry)
    return
  client.send({
    type: 'skills:list',
    data: {
      skills: registry.getAll().map(mapToEventFormat),
    },
  })
}

export function registerSkillsHandler(client: Client, brainStore: BrainStore): void {
  if (registry) {
    log.warn('Skills handler already registered, skipping duplicate registration')
    return
  }

  const builtinDir = process.env.ANASE_SKILLS_BUILTIN_DIR ?? './skills/builtin'
  const userDir = process.env.ANASE_SKILLS_USER_DIR ?? './skills/user'

  registry = new SkillRegistry({ builtinSkillsDir: builtinDir, userSkillsDir: userDir })

  // Load skills asynchronously, restore active states from DB
  registry.loadAll()
    .then(() => {
      const savedStates = brainStore.getAllSkillStates()
      for (const entry of registry!.getAll()) {
        const savedActive = savedStates.get(entry.skill.metadata.id)
        if (savedActive !== undefined) {
          if (savedActive) {
            registry!.activate(entry.skill.metadata.id)
          }
          else {
            registry!.deactivate(entry.skill.metadata.id)
          }
        }
      }
      log.withFields({ count: registry!.getAll().length }).log('Skills loaded and restored')
      broadcastList(client)
    })
    .catch((err) => {
      log.withError(err).warn('Failed to discover skills, using empty registry')
    })

  client.onEvent('skills:list', () => {
    log.log('Received skills:list request')
    broadcastList(client)
  })

  client.onEvent('skills:toggle', (event) => {
    const { id, active } = event.data as { id: string, active: boolean }

    if (!registry) {
      client.send({ type: 'skills:toggled', data: { id, active: false, success: false } })
      return
    }

    const success = active ? registry.activate(id) : registry.deactivate(id)

    if (success) {
      brainStore.setSkillActive(id, active)
    }

    log.log('Toggled skill', { id, active, success })
    client.send({ type: 'skills:toggled', data: { id, active, success } })
  })
}

/**
 * Build a skills context string from the current registry state.
 * Returns empty string if no skills are loaded.
 */
export function getSkillsContextText(): string {
  if (!registry)
    return ''
  const allSkills = registry.getAll().map(e => e.skill)
  const activeSkills = registry.getActive()
  return buildSkillsContext(allSkills, activeSkills)
}
