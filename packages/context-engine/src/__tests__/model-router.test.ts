import type { LlmProvider } from '../types'

import { describe, expect, it } from 'vitest'

import { classifyTask, ModelRouter } from '../processing/model-router'

// --- Test Doubles ---
// Test Double rationale: LLM providers are external API boundaries (cloud/local AI services).

function createTrackingProvider(name: string): LlmProvider & { calls: Array<{ method: string, system: string }> } {
  const calls: Array<{ method: string, system: string }> = []
  return {
    calls,
    async generateText(options: { system: string, prompt: string }): Promise<string> {
      calls.push({ method: 'generateText', system: options.system })
      return `[${name}] text response`
    },
    async generateStructured<T>(options: {
      system: string
      prompt: string
      schemaDescription: string
    }): Promise<T> {
      calls.push({ method: 'generateStructured', system: options.system })
      return { result: `[${name}] structured` } as T
    },
  }
}

describe('modelRouter', () => {
  describe('classifyTask (pure function)', () => {
    it('classifies prompts with "classify" keyword as classification', () => {
      expect(classifyTask('Classify the user\'s current activity into one of these types')).toBe('classification')
    })

    it('classifies prompts with "categorize" keyword as classification', () => {
      expect(classifyTask('Categorize this input into the following buckets')).toBe('classification')
    })

    it('classifies prompts with entity extraction keywords as extraction', () => {
      expect(classifyTask('Extract named entities from the following text')).toBe('extraction')
    })

    it('classifies prompts with NER-related schema as extraction', () => {
      expect(classifyTask('Analyze the text', '{ persons: string[], organizations: string[] }')).toBe('extraction')
    })

    it('classifies prompts with "summarize" keyword as summarization', () => {
      expect(classifyTask('Summarize the following context into a concise paragraph')).toBe('summarization')
    })

    it('classifies prompts with "summary" keyword as summarization', () => {
      expect(classifyTask('You are a context summarizer. Given multiple context descriptions...')).toBe('summarization')
    })

    it('classifies prompts with "generate" keyword as generation', () => {
      expect(classifyTask('Generate a personalized health tip based on user activity')).toBe('generation')
    })

    it('classifies prompts with "create" keyword as generation', () => {
      expect(classifyTask('Create a daily report for the user\'s activities')).toBe('generation')
    })

    it('defaults to generation for unrecognized prompts', () => {
      expect(classifyTask('Do something with this text')).toBe('generation')
    })
  })

  describe('routing', () => {
    it('routes classification tasks to lightweight provider', async () => {
      const lightweight = createTrackingProvider('lightweight')
      const standard = createTrackingProvider('standard')
      const router = new ModelRouter({
        providers: { lightweight, standard },
      })

      await router.generateStructured({
        system: 'Classify the user\'s current activity into exactly one type',
        prompt: 'User is writing code in VS Code',
        schemaDescription: '{ activityType: "coding" | "writing" }',
      })

      expect(lightweight.calls).toHaveLength(1)
      expect(standard.calls).toHaveLength(0)
    })

    it('routes extraction tasks to lightweight provider', async () => {
      const lightweight = createTrackingProvider('lightweight')
      const standard = createTrackingProvider('standard')
      const router = new ModelRouter({
        providers: { lightweight, standard },
      })

      await router.generateStructured({
        system: 'Extract named entities from the text',
        prompt: 'Alice and Bob work at Anthropic',
        schemaDescription: '{ persons: string[], organizations: string[] }',
      })

      expect(lightweight.calls).toHaveLength(1)
      expect(standard.calls).toHaveLength(0)
    })

    it('routes generation tasks to standard provider', async () => {
      const lightweight = createTrackingProvider('lightweight')
      const standard = createTrackingProvider('standard')
      const router = new ModelRouter({
        providers: { lightweight, standard },
      })

      await router.generateText({
        system: 'Generate a personalized health tip based on the user activity',
        prompt: 'User has been coding for 4 hours without a break',
      })

      expect(standard.calls).toHaveLength(1)
      expect(lightweight.calls).toHaveLength(0)
    })

    it('routes summarization tasks to standard provider', async () => {
      const lightweight = createTrackingProvider('lightweight')
      const standard = createTrackingProvider('standard')
      const router = new ModelRouter({
        providers: { lightweight, standard },
      })

      await router.generateText({
        system: 'You are a context summarizer. Given multiple context descriptions, produce a summary.',
        prompt: '[screenshot] User is writing code\n[activity] Active for 30 min',
      })

      expect(standard.calls).toHaveLength(1)
      expect(lightweight.calls).toHaveLength(0)
    })

    it('routes to local provider for classification when available', async () => {
      const lightweight = createTrackingProvider('lightweight')
      const standard = createTrackingProvider('standard')
      const local = createTrackingProvider('local')
      const router = new ModelRouter({
        providers: { lightweight, standard, local },
      })

      await router.generateStructured({
        system: 'Classify the user\'s current activity',
        prompt: 'User is browsing the web',
        schemaDescription: '{ activityType: string }',
      })

      expect(local.calls).toHaveLength(1)
      expect(lightweight.calls).toHaveLength(0)
      expect(standard.calls).toHaveLength(0)
    })

    it('routes to local provider for extraction when available', async () => {
      const lightweight = createTrackingProvider('lightweight')
      const standard = createTrackingProvider('standard')
      const local = createTrackingProvider('local')
      const router = new ModelRouter({
        providers: { lightweight, standard, local },
      })

      await router.generateStructured({
        system: 'Extract named entities from the text',
        prompt: 'Alice works at Google',
        schemaDescription: '{ persons: string[], organizations: string[] }',
      })

      expect(local.calls).toHaveLength(1)
      expect(lightweight.calls).toHaveLength(0)
      expect(standard.calls).toHaveLength(0)
    })

    it('falls back to lightweight when local is not available for classification', async () => {
      const lightweight = createTrackingProvider('lightweight')
      const standard = createTrackingProvider('standard')
      const router = new ModelRouter({
        providers: { lightweight, standard },
        // no local provider
      })

      await router.generateStructured({
        system: 'Classify the input',
        prompt: 'some input',
        schemaDescription: '{ type: string }',
      })

      expect(lightweight.calls).toHaveLength(1)
      expect(standard.calls).toHaveLength(0)
    })

    it('respects routing overrides', async () => {
      const lightweight = createTrackingProvider('lightweight')
      const standard = createTrackingProvider('standard')
      const router = new ModelRouter({
        providers: { lightweight, standard },
        routingOverrides: { classification: 'standard' },
      })

      await router.generateStructured({
        system: 'Classify the user\'s current activity',
        prompt: 'User is coding',
        schemaDescription: '{ activityType: string }',
      })

      expect(standard.calls).toHaveLength(1)
      expect(lightweight.calls).toHaveLength(0)
    })

    it('returns correct response from routed provider', async () => {
      const lightweight = createTrackingProvider('lightweight')
      const standard = createTrackingProvider('standard')
      const router = new ModelRouter({
        providers: { lightweight, standard },
      })

      const textResult = await router.generateText({
        system: 'Generate a tip for the user',
        prompt: 'User is tired',
      })
      expect(textResult).toBe('[standard] text response')

      const structuredResult = await router.generateStructured<{ result: string }>({
        system: 'Classify the activity type',
        prompt: 'User is coding',
        schemaDescription: '{ activityType: string }',
      })
      expect(structuredResult).toEqual({ result: '[lightweight] structured' })
    })
  })

  describe('routing stats', () => {
    it('tracks call count per tier', async () => {
      const lightweight = createTrackingProvider('lightweight')
      const standard = createTrackingProvider('standard')
      const router = new ModelRouter({
        providers: { lightweight, standard },
      })

      // 2 classification calls → lightweight
      await router.generateStructured({ system: 'Classify this', prompt: 'a', schemaDescription: '{}' })
      await router.generateStructured({ system: 'Classify that', prompt: 'b', schemaDescription: '{}' })
      // 1 generation call → standard
      await router.generateText({ system: 'Generate a report', prompt: 'data' })

      const stats = router.getStats()
      expect(stats.callsByTier.lightweight).toBe(2)
      expect(stats.callsByTier.standard).toBe(1)
      expect(stats.callsByTier.local).toBe(0)
      expect(stats.totalCalls).toBe(3)
    })

    it('tracks call count by task type', async () => {
      const lightweight = createTrackingProvider('lightweight')
      const standard = createTrackingProvider('standard')
      const router = new ModelRouter({
        providers: { lightweight, standard },
      })

      await router.generateStructured({ system: 'Classify this', prompt: 'a', schemaDescription: '{}' })
      await router.generateText({ system: 'Summarize this context', prompt: 'data' })
      await router.generateText({ system: 'Generate a health tip', prompt: 'data' })

      const stats = router.getStats()
      expect(stats.callsByTaskType.classification).toBe(1)
      expect(stats.callsByTaskType.summarization).toBe(1)
      expect(stats.callsByTaskType.generation).toBe(1)
    })

    it('reports estimated cost savings ratio', async () => {
      const lightweight = createTrackingProvider('lightweight')
      const standard = createTrackingProvider('standard')
      const local = createTrackingProvider('local')
      const router = new ModelRouter({
        providers: { lightweight, standard, local },
      })

      // 3 classification calls → local (free)
      await router.generateStructured({ system: 'Classify a', prompt: 'x', schemaDescription: '{}' })
      await router.generateStructured({ system: 'Classify b', prompt: 'y', schemaDescription: '{}' })
      await router.generateStructured({ system: 'Classify c', prompt: 'z', schemaDescription: '{}' })
      // 1 generation call → standard
      await router.generateText({ system: 'Generate report', prompt: 'data' })

      const stats = router.getStats()
      // 3 of 4 calls went to local (free), so savings ratio = 3/4 = 0.75
      expect(stats.estimatedSavingsRatio).toBeGreaterThanOrEqual(0.5)
    })

    it('resets stats', async () => {
      const lightweight = createTrackingProvider('lightweight')
      const standard = createTrackingProvider('standard')
      const router = new ModelRouter({
        providers: { lightweight, standard },
      })

      await router.generateText({ system: 'Generate something', prompt: 'data' })
      expect(router.getStats().totalCalls).toBe(1)

      router.resetStats()
      const stats = router.getStats()
      expect(stats.totalCalls).toBe(0)
      expect(stats.callsByTier.lightweight).toBe(0)
      expect(stats.callsByTier.standard).toBe(0)
    })
  })

  describe('error handling', () => {
    it('wraps provider errors with routing context', async () => {
      const failingProvider: LlmProvider = {
        async generateText(): Promise<string> {
          throw new Error('Model overloaded')
        },
        async generateStructured(): Promise<never> {
          throw new Error('Model overloaded')
        },
      }
      const standard = createTrackingProvider('standard')
      const router = new ModelRouter({
        providers: { lightweight: failingProvider, standard },
      })

      await expect(
        router.generateStructured({
          system: 'Classify this',
          prompt: 'data',
          schemaDescription: '{}',
        }),
      ).rejects.toThrow('lightweight provider failed for classification task')
    })

    it('does not increment stats on provider failure', async () => {
      const failingProvider: LlmProvider = {
        async generateText(): Promise<string> {
          throw new Error('Network error')
        },
        async generateStructured(): Promise<never> {
          throw new Error('Network error')
        },
      }
      const standard = createTrackingProvider('standard')
      const router = new ModelRouter({
        providers: { lightweight: failingProvider, standard },
      })

      await expect(
        router.generateStructured({
          system: 'Classify this',
          prompt: 'data',
          schemaDescription: '{}',
        }),
      ).rejects.toThrow()

      const stats = router.getStats()
      expect(stats.totalCalls).toBe(0)
      expect(stats.callsByTier.lightweight).toBe(0)
    })

    it('preserves original error as cause', async () => {
      const originalError = new Error('API rate limit exceeded')
      const failingProvider: LlmProvider = {
        async generateText(): Promise<string> {
          throw originalError
        },
        async generateStructured(): Promise<never> {
          throw originalError
        },
      }
      const standard = createTrackingProvider('standard')
      const router = new ModelRouter({
        providers: { lightweight: failingProvider, standard },
      })

      try {
        await router.generateStructured({
          system: 'Classify this',
          prompt: 'data',
          schemaDescription: '{}',
        })
        expect.unreachable('Should have thrown')
      }
      catch (error) {
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).cause).toBe(originalError)
      }
    })
  })

  describe('serialization', () => {
    it('toJSON returns same data as getStats', async () => {
      const lightweight = createTrackingProvider('lightweight')
      const standard = createTrackingProvider('standard')
      const router = new ModelRouter({
        providers: { lightweight, standard },
      })

      await router.generateStructured({ system: 'Classify this', prompt: 'a', schemaDescription: '{}' })
      await router.generateText({ system: 'Generate report', prompt: 'data' })

      expect(router.toJSON()).toEqual(router.getStats())
    })
  })

  describe('integration with ContextMerger', () => {
    it('modelRouter implements LlmProvider interface', () => {
      const lightweight = createTrackingProvider('lightweight')
      const standard = createTrackingProvider('standard')
      const router = new ModelRouter({
        providers: { lightweight, standard },
      })

      // Verify LlmProvider interface compliance
      expect(typeof router.generateText).toBe('function')
      expect(typeof router.generateStructured).toBe('function')
    })

    it('modelRouter can be passed to ContextMerger as LlmProvider', async () => {
      const lightweight = createTrackingProvider('lightweight')
      const standard = createTrackingProvider('standard')
      const router = new ModelRouter({
        providers: { lightweight, standard },
      })

      // ContextMerger accepts LlmProvider — ModelRouter satisfies this interface
      const { ContextMerger } = await import('../processing/context-merger')
      const merger = new ContextMerger({ llm: router })

      // Prove the wiring works: merge a single source
      const result = await merger.merge([{
        source: 'test',
        summary: 'User is coding in VS Code',
        keywords: ['coding', 'vscode'],
        entities: ['VS Code'],
        importance: 0.8,
        timestamp: Date.now(),
      }])

      // ContextMerger made LLM calls through ModelRouter
      expect(result.summary).toBeDefined()
      expect(router.getStats().totalCalls).toBeGreaterThan(0)
    })
  })
})
