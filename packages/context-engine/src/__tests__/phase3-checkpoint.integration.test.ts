import type { ActivityType, ContextSource, ExtractedEntities, MergedContext } from '../processing/types'
import type { LlmProvider } from '../types'

import { describe, expect, it } from 'vitest'

import { ContextMerger } from '../processing/context-merger'

// Test Double rationale: LLM is an external cloud API boundary.
// We verify the multi-source merging orchestration, not the LLM itself.
class StubLlmProvider implements LlmProvider {
  private summaryResponse: string
  private entityResponse: ExtractedEntities
  private activityResponse: { activityType: ActivityType }

  constructor(overrides?: {
    summary?: string
    entities?: ExtractedEntities
    activityType?: ActivityType
  }) {
    this.summaryResponse = overrides?.summary
      ?? 'User is coding TypeScript in VS Code while reviewing PDF documentation.'
    this.entityResponse = overrides?.entities ?? {
      persons: [],
      organizations: ['Anthropic'],
      locations: [],
      technologies: ['TypeScript', 'VS Code', 'Node.js'],
      concepts: ['code review', 'documentation'],
    }
    this.activityResponse = { activityType: overrides?.activityType ?? 'coding' }
  }

  async generateText(_options: { system: string, prompt: string }): Promise<string> {
    return this.summaryResponse
  }

  async generateStructured<T>({ schemaDescription }: {
    system: string
    prompt: string
    schemaDescription: string
  }): Promise<T> {
    if (schemaDescription.includes('persons')) {
      return this.entityResponse as T
    }
    return this.activityResponse as T
  }
}

function makeSource(overrides: Partial<ContextSource> & { source: ContextSource['source'] }): ContextSource {
  return {
    summary: 'default summary',
    entities: [],
    keywords: [],
    timestamp: Date.now(),
    importance: 0.5,
    ...overrides,
  }
}

describe('phase 3 checkpoint: multi-source context merging', () => {
  describe('screenshot + document + activity triple-source merge', () => {
    it('merges all 3 source types into a valid MergedContext', async () => {
      const llm = new StubLlmProvider()
      const merger = new ContextMerger({ llm })

      const now = Date.now()
      const sources: ContextSource[] = [
        makeSource({
          source: 'screenshot',
          summary: 'User has VS Code open with a TypeScript file, terminal running tests',
          entities: ['VS Code', 'TypeScript', 'Vitest'],
          keywords: ['coding', 'testing', 'typescript'],
          timestamp: now,
          importance: 0.9,
        }),
        makeSource({
          source: 'document',
          summary: 'Reading API documentation for Anthropic Claude SDK',
          entities: ['Anthropic', 'Claude SDK'],
          keywords: ['api', 'documentation', 'anthropic'],
          timestamp: now - 5000,
          importance: 0.6,
        }),
        makeSource({
          source: 'activity',
          summary: 'Active in VS Code for 2 hours, switched to Chrome for 5 minutes',
          entities: ['VS Code', 'Chrome'],
          keywords: ['development', 'browsing'],
          timestamp: now - 10000,
          importance: 0.7,
        }),
      ]

      const result = await merger.merge(sources)

      // Verify complete MergedContext structure
      expect(result).toMatchObject({
        summary: expect.any(String),
        keywords: expect.any(Array),
        entities: expect.any(Array),
        extractedEntities: expect.objectContaining({
          persons: expect.any(Array),
          organizations: expect.any(Array),
          locations: expect.any(Array),
          technologies: expect.any(Array),
          concepts: expect.any(Array),
        }),
        importance: expect.any(Number),
        activityType: expect.any(String),
        sourceCount: 3,
        timestamp: expect.any(Number),
      } satisfies Record<keyof MergedContext, unknown>)

      // All 3 sources contributed
      expect(result.sourceCount).toBe(3)

      // Entities from all sources deduplicated: VS Code appears in screenshot + activity → once
      const lowerEntities = result.entities.map(e => e.toLowerCase())
      const uniqueLower = [...new Set(lowerEntities)]
      expect(lowerEntities).toEqual(uniqueLower)
      // Must contain entities from all 3 sources
      expect(lowerEntities).toContain('vs code')
      expect(lowerEntities).toContain('typescript')
      expect(lowerEntities).toContain('anthropic')
      expect(lowerEntities).toContain('chrome')

      // Keywords from all sources deduplicated
      const lowerKeywords = result.keywords.map(k => k.toLowerCase())
      const uniqueKeywords = [...new Set(lowerKeywords)]
      expect(lowerKeywords).toEqual(uniqueKeywords)
      expect(lowerKeywords).toContain('coding')
      expect(lowerKeywords).toContain('documentation')
      expect(lowerKeywords).toContain('development')

      // Importance is average of 0.9, 0.6, 0.7
      expect(result.importance).toBeCloseTo((0.9 + 0.6 + 0.7) / 3, 2)

      // Activity type classified
      expect(result.activityType).toBe('coding')
    })

    it('preserves source type labels in combined text sent to LLM', async () => {
      let capturedPrompt = ''
      const llm: LlmProvider = {
        async generateText(options): Promise<string> {
          capturedPrompt = options.prompt
          return 'summary'
        },
        async generateStructured<T>(options: {
          system: string
          prompt: string
          schemaDescription: string
        }): Promise<T> {
          if (options.schemaDescription.includes('persons')) {
            return { persons: [], organizations: [], locations: [], technologies: [], concepts: [] } as T
          }
          return { activityType: 'coding' } as T
        },
      }

      const merger = new ContextMerger({ llm })
      await merger.merge([
        makeSource({ source: 'screenshot', summary: 'screenshot context' }),
        makeSource({ source: 'document', summary: 'document context' }),
        makeSource({ source: 'activity', summary: 'activity context' }),
      ])

      // Combined text should include source labels
      expect(capturedPrompt).toContain('[screenshot]')
      expect(capturedPrompt).toContain('[document]')
      expect(capturedPrompt).toContain('[activity]')
      expect(capturedPrompt).toContain('screenshot context')
      expect(capturedPrompt).toContain('document context')
      expect(capturedPrompt).toContain('activity context')
    })

    it('handles all 5 valid source types', async () => {
      const llm = new StubLlmProvider()
      const merger = new ContextMerger({ llm })

      const sourceTypes: ContextSource['source'][] = ['screenshot', 'activity', 'document', 'web', 'system']
      const sources = sourceTypes.map((source, i) =>
        makeSource({
          source,
          summary: `${source} data`,
          entities: [`${source}-entity`],
          keywords: [`${source}-keyword`],
          timestamp: Date.now() - i * 1000,
        }),
      )

      const result = await merger.merge(sources)
      expect(result.sourceCount).toBe(5)
      expect(result.entities).toHaveLength(5)
      expect(result.keywords).toHaveLength(5)
    })

    it('respects recency when maxSources is exceeded with mixed types', async () => {
      const llm = new StubLlmProvider()
      const merger = new ContextMerger({ llm, maxSources: 2 })

      const sources: ContextSource[] = [
        makeSource({ source: 'screenshot', timestamp: 3000, summary: 'newest screenshot' }),
        makeSource({ source: 'activity', timestamp: 1000, summary: 'old activity' }),
        makeSource({ source: 'document', timestamp: 2000, summary: 'middle document' }),
      ]

      const result = await merger.merge(sources)
      expect(result.sourceCount).toBe(2)
      // Only 2 most recent should be kept
      expect(result.importance).toBeCloseTo(0.5, 1)
    })
  })

  describe('entity extraction across multiple source types', () => {
    it('extracts structured entities from combined multi-source text', async () => {
      const entities: ExtractedEntities = {
        persons: ['Alice', 'Bob'],
        organizations: ['Google', 'Anthropic'],
        locations: ['Tokyo'],
        technologies: ['React', 'TypeScript', 'VS Code'],
        concepts: ['AI development', 'web app'],
      }
      const llm = new StubLlmProvider({ entities })
      const merger = new ContextMerger({ llm })

      const result = await merger.merge([
        makeSource({
          source: 'screenshot',
          summary: 'Alice reviewing React code in VS Code',
        }),
        makeSource({
          source: 'document',
          summary: 'Meeting notes: Bob from Google discussing AI development',
        }),
        makeSource({
          source: 'activity',
          summary: 'Working on Anthropic project from Tokyo office',
        }),
      ])

      expect(result.extractedEntities.persons).toContain('Alice')
      expect(result.extractedEntities.persons).toContain('Bob')
      expect(result.extractedEntities.organizations).toContain('Google')
      expect(result.extractedEntities.organizations).toContain('Anthropic')
      expect(result.extractedEntities.locations).toContain('Tokyo')
      expect(result.extractedEntities.technologies).toContain('React')
    })
  })

  describe('error paths', () => {
    it('throws when merging empty sources array', async () => {
      const llm = new StubLlmProvider()
      const merger = new ContextMerger({ llm })

      await expect(merger.merge([])).rejects.toThrow(
        'At least one context source is required',
      )
    })

    it('wraps LLM failures with context merge error', async () => {
      // Test Double rationale: LLM is an external cloud API boundary.
      // We verify failure propagation, not the LLM itself.
      const failingLlm: LlmProvider = {
        async generateText(): Promise<string> {
          throw new Error('LLM API timeout')
        },
        async generateStructured<T>(): Promise<T> {
          throw new Error('LLM API timeout')
        },
      }
      const merger = new ContextMerger({ llm: failingLlm })

      await expect(
        merger.merge([makeSource({ source: 'screenshot', summary: 'test' })]),
      ).rejects.toThrow('Context merge failed')
    })

    it('rejects maxSources < 1 in constructor', () => {
      const llm = new StubLlmProvider()
      expect(() => new ContextMerger({ llm, maxSources: 0 })).toThrow(
        'maxSources must be >= 1',
      )
    })
  })

  describe('activity classification from multi-source context', () => {
    const activityScenarios: Array<{ name: string, expected: ActivityType }> = [
      { name: 'coding', expected: 'coding' },
      { name: 'writing', expected: 'writing' },
      { name: 'browsing', expected: 'browsing' },
      { name: 'communication', expected: 'communication' },
      { name: 'entertainment', expected: 'entertainment' },
      { name: 'meeting', expected: 'meeting' },
      { name: 'other', expected: 'other' },
    ]

    for (const scenario of activityScenarios) {
      it(`classifies "${scenario.name}" activity from mixed sources`, async () => {
        const llm = new StubLlmProvider({ activityType: scenario.expected })
        const merger = new ContextMerger({ llm })

        const result = await merger.merge([
          makeSource({ source: 'screenshot', summary: `user doing ${scenario.name}` }),
          makeSource({ source: 'activity', summary: `${scenario.name} activity detected` }),
        ])

        expect(result.activityType).toBe(scenario.expected)
      })
    }
  })
})
