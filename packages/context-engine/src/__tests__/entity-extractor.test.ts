import type { ExtractedEntities } from '../processing/types'
import type { LlmProvider } from '../types'

import { describe, expect, it } from 'vitest'

import { EntityExtractor } from '../processing/entity-extractor'

// Test Double rationale: LLM is an external API boundary (cloud AI service).
// We verify the extraction orchestration and input formatting, not the LLM itself.
class StubLlmProvider implements LlmProvider {
  public calls: Array<{ system: string, prompt: string, schemaDescription: string }> = []
  private response: ExtractedEntities

  constructor(response?: Partial<ExtractedEntities>) {
    this.response = {
      persons: response?.persons ?? ['Alice', 'Bob'],
      organizations: response?.organizations ?? ['Anthropic'],
      locations: response?.locations ?? ['San Francisco'],
      technologies: response?.technologies ?? ['TypeScript'],
      concepts: response?.concepts ?? ['machine learning'],
    }
  }

  async generateText(options: { system: string, prompt: string }): Promise<string> {
    return JSON.stringify(options)
  }

  async generateStructured<T>(options: {
    system: string
    prompt: string
    schemaDescription: string
  }): Promise<T> {
    this.calls.push(options)
    return this.response as T
  }
}

describe('entityExtractor', () => {
  it('extracts entities from text via LLM', async () => {
    const llm = new StubLlmProvider()
    const extractor = new EntityExtractor(llm)

    const result = await extractor.extract('Alice from Anthropic is working on TypeScript in San Francisco')

    expect(result).toEqual({
      persons: ['Alice', 'Bob'],
      organizations: ['Anthropic'],
      locations: ['San Francisco'],
      technologies: ['TypeScript'],
      concepts: ['machine learning'],
    })
  })

  it('passes input text to LLM prompt', async () => {
    const llm = new StubLlmProvider()
    const extractor = new EntityExtractor(llm)
    const inputText = 'Bob is reviewing code at Google headquarters'

    await extractor.extract(inputText)

    expect(llm.calls).toHaveLength(1)
    expect(llm.calls[0].prompt).toContain(inputText)
  })

  it('uses NER-specific system prompt', async () => {
    const llm = new StubLlmProvider()
    const extractor = new EntityExtractor(llm)

    await extractor.extract('some text')

    expect(llm.calls[0].system).toContain('entity')
  })

  it('requests correct schema description', async () => {
    const llm = new StubLlmProvider()
    const extractor = new EntityExtractor(llm)

    await extractor.extract('some text')

    const schema = llm.calls[0].schemaDescription
    expect(schema).toContain('persons')
    expect(schema).toContain('organizations')
    expect(schema).toContain('locations')
    expect(schema).toContain('technologies')
    expect(schema).toContain('concepts')
  })

  it('returns all five entity categories', async () => {
    const expected: ExtractedEntities = {
      persons: ['Carol'],
      organizations: ['Mozilla'],
      locations: ['Berlin'],
      technologies: ['Rust'],
      concepts: ['open source'],
    }
    const llm = new StubLlmProvider(expected)
    const extractor = new EntityExtractor(llm)

    const result = await extractor.extract('Carol at Mozilla Berlin works on Rust open source projects')

    expect(result.persons).toEqual(['Carol'])
    expect(result.organizations).toEqual(['Mozilla'])
    expect(result.locations).toEqual(['Berlin'])
    expect(result.technologies).toEqual(['Rust'])
    expect(result.concepts).toEqual(['open source'])
  })

  it('handles empty text gracefully', async () => {
    const llm = new StubLlmProvider({
      persons: [],
      organizations: [],
      locations: [],
      technologies: [],
      concepts: [],
    })
    const extractor = new EntityExtractor(llm)

    const result = await extractor.extract('')

    expect(result.persons).toEqual([])
    expect(result.organizations).toEqual([])
    expect(result.locations).toEqual([])
    expect(result.technologies).toEqual([])
    expect(result.concepts).toEqual([])
  })

  it('validates LLM output and returns safe defaults for malformed responses', async () => {
    const malformedLlm: LlmProvider = {
      async generateText(): Promise<string> {
        return ''
      },
      async generateStructured<T>(): Promise<T> {
        // LLM returns garbage: missing fields, wrong types
        return { persons: 'not-an-array', organizations: null } as T
      },
    }
    const extractor = new EntityExtractor(malformedLlm)

    const result = await extractor.extract('some text')

    // Should return safe defaults for invalid fields
    expect(result.persons).toEqual([])
    expect(result.organizations).toEqual([])
    expect(result.locations).toEqual([])
    expect(result.technologies).toEqual([])
    expect(result.concepts).toEqual([])
  })

  it('includes text length in error message', async () => {
    const failingLlm: LlmProvider = {
      async generateText(): Promise<string> {
        throw new Error('unreachable')
      },
      async generateStructured(): Promise<never> {
        throw new Error('API failed')
      },
    }
    const extractor = new EntityExtractor(failingLlm)

    await expect(
      extractor.extract('hello world'),
    ).rejects.toSatisfy((error: Error) => {
      return error.message.includes('text length=11')
    })
  })

  it('wraps LLM errors with context', async () => {
    const failingLlm: LlmProvider = {
      async generateText(): Promise<string> {
        throw new Error('unreachable')
      },
      async generateStructured(): Promise<never> {
        throw new Error('API quota exceeded')
      },
    }
    const extractor = new EntityExtractor(failingLlm)

    await expect(
      extractor.extract('some text'),
    ).rejects.toSatisfy((error: Error) => {
      return error.message === 'Entity extraction failed (text length=9)'
        && error.cause instanceof Error
        && error.cause.message === 'API quota exceeded'
    })
  })
})
