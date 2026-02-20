import type { LlmProvider } from '../types'
import type { ExtractedEntities } from './types'

const SYSTEM_PROMPT = `You are a named entity recognition (NER) system.
Extract entities from the provided text and categorize them into the following groups:
- persons: Names of people
- organizations: Company names, institutions, teams
- locations: Cities, countries, buildings, places
- technologies: Programming languages, frameworks, tools, software
- concepts: Abstract ideas, methodologies, project types

Return ONLY the JSON object with the five arrays. Include only entities explicitly mentioned or strongly implied in the text.`

const SCHEMA_DESCRIPTION = '{ persons: string[], organizations: string[], locations: string[], technologies: string[], concepts: string[] }'

const ENTITY_FIELDS = ['persons', 'organizations', 'locations', 'technologies', 'concepts'] as const

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

/**
 * Validates that the LLM output conforms to the ExtractedEntities shape.
 * Returns a safe default (all empty arrays) for any malformed field.
 */
function validateExtractedEntities(raw: unknown): ExtractedEntities {
  if (raw == null || typeof raw !== 'object') {
    return { persons: [], organizations: [], locations: [], technologies: [], concepts: [] }
  }

  const obj = raw as Record<string, unknown>
  return {
    persons: isStringArray(obj.persons) ? obj.persons : [],
    organizations: isStringArray(obj.organizations) ? obj.organizations : [],
    locations: isStringArray(obj.locations) ? obj.locations : [],
    technologies: isStringArray(obj.technologies) ? obj.technologies : [],
    concepts: isStringArray(obj.concepts) ? obj.concepts : [],
  }
}

/**
 * Extracts structured named entities from text using an LLM.
 *
 * Imperative Shell: depends on external LLM API.
 */
export class EntityExtractor {
  constructor(private readonly llm: LlmProvider) {}

  async extract(text: string): Promise<ExtractedEntities> {
    try {
      const raw = await this.llm.generateStructured<unknown>({
        system: SYSTEM_PROMPT,
        prompt: text,
        schemaDescription: SCHEMA_DESCRIPTION,
      })
      return validateExtractedEntities(raw)
    }
    catch (cause) {
      throw new Error(`Entity extraction failed (text length=${text.length})`, { cause })
    }
  }
}

export { ENTITY_FIELDS, validateExtractedEntities }
