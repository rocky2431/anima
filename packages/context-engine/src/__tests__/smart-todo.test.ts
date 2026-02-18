import type { Todo } from '../storage/types'
import type {
  EmbeddingProvider,
  LlmProvider,
  PersonaConfig,
  ProcessedContext,
  SmartTodoResult,
} from '../types'

import { describe, expect, it } from 'vitest'

import { SmartTodo } from '../consumption/smart-todo'

/**
 * Test Double rationale: LLM API is an external service with network dependency,
 * rate limits, and non-deterministic output. We control responses to verify
 * prompt construction and result processing logic.
 */
class StubLlmProvider implements LlmProvider {
  readonly calls: Array<{ system: string, prompt: string, schemaDescription?: string }> = []
  private structuredResponse: unknown

  constructor(response: unknown) {
    this.structuredResponse = response
  }

  async generateText(options: { system: string, prompt: string }): Promise<string> {
    this.calls.push(options)
    return JSON.stringify(this.structuredResponse)
  }

  async generateStructured<T>(options: {
    system: string
    prompt: string
    schemaDescription: string
  }): Promise<T> {
    this.calls.push(options)
    return this.structuredResponse as T
  }
}

/**
 * Test Double rationale: Embedding API is an external service. We use
 * deterministic vectors derived from string hash to test dedup logic
 * without network calls or API costs.
 */
class StubEmbeddingProvider implements EmbeddingProvider {
  readonly dimension = 8

  async embed(text: string): Promise<number[]> {
    const vector = Array.from({ length: this.dimension }, () => 0)
    for (let i = 0; i < text.length; i++) {
      vector[i % this.dimension] += text.charCodeAt(i) / 1000
    }
    // Normalize
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0))
    if (magnitude > 0) {
      return vector.map(v => v / magnitude)
    }
    return vector
  }
}

/**
 * Test Double rationale: Embedding provider that returns identical vectors
 * for all inputs, simulating "all suggestions are duplicates" scenario.
 */
class IdenticalEmbeddingProvider implements EmbeddingProvider {
  readonly dimension = 8
  private readonly fixedVector: number[]

  constructor() {
    this.fixedVector = Array.from({ length: this.dimension }, (_, i) => (i + 1) / this.dimension)
  }

  async embed(_text: string): Promise<number[]> {
    return [...this.fixedVector]
  }
}

const TEST_PERSONA: PersonaConfig = {
  name: '小柔',
  personality: '温柔体贴、善解人意',
  speakingStyle: '说话轻柔，常用语气词"呢"、"嘛"、"哦"',
}

function makeProcessedContext(
  timestamp: number,
  overrides: Partial<ProcessedContext> = {},
): ProcessedContext {
  return {
    activity: {
      currentApp: 'VS Code',
      currentWindowTitle: 'editor.ts',
      isActive: true,
      continuousWorkDurationMs: 60_000,
      recentApps: ['VS Code'],
      lastActivityTimestamp: timestamp,
      isFullscreen: false,
    },
    timestamp,
    ...overrides,
  }
}

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 'todo-1',
    title: '完成编辑器功能',
    completed: false,
    createdAt: Date.now(),
    completedAt: null,
    ...overrides,
  }
}

describe('smartTodo', () => {
  const SAMPLE_SUGGESTIONS: SmartTodoResult = {
    suggestions: [
      { title: '整理今天的代码笔记', reason: '你今天在 VS Code 写了很多代码，整理一下会更有条理' },
      { title: '回复 Slack 消息', reason: '看到你切换到了 Slack，可能有未回复的消息' },
    ],
  }

  describe('generate', () => {
    it('generates todo suggestions from context data', async () => {
      const llm = new StubLlmProvider(SAMPLE_SUGGESTIONS)
      const embedding = new StubEmbeddingProvider()
      const todo = new SmartTodo({ llm, embedding, persona: TEST_PERSONA })

      const result = await todo.generate(makeProcessedContext(Date.now()), [])

      expect(result.suggestions.length).toBeGreaterThan(0)
      expect(result.suggestions[0].title).toBeTruthy()
      expect(result.suggestions[0].reason).toBeTruthy()
    })

    it('includes persona context in LLM system prompt', async () => {
      const llm = new StubLlmProvider(SAMPLE_SUGGESTIONS)
      const embedding = new StubEmbeddingProvider()
      const todo = new SmartTodo({ llm, embedding, persona: TEST_PERSONA })

      await todo.generate(makeProcessedContext(Date.now()), [])

      expect(llm.calls).toHaveLength(1)
      expect(llm.calls[0].system).toContain('小柔')
      expect(llm.calls[0].system).toContain('温柔体贴')
    })

    it('includes existing todos in LLM prompt to avoid duplicates', async () => {
      const llm = new StubLlmProvider(SAMPLE_SUGGESTIONS)
      const embedding = new StubEmbeddingProvider()
      const todo = new SmartTodo({ llm, embedding, persona: TEST_PERSONA })

      const existingTodos = [
        makeTodo({ title: '完成编辑器功能' }),
        makeTodo({ id: 'todo-2', title: '写单元测试' }),
      ]

      await todo.generate(makeProcessedContext(Date.now()), existingTodos)

      expect(llm.calls[0].prompt).toContain('完成编辑器功能')
      expect(llm.calls[0].prompt).toContain('写单元测试')
    })

    it('filters out suggestions that are too similar to recent suggestions via embedding dedup', async () => {
      const suggestions1: SmartTodoResult = {
        suggestions: [
          { title: '整理代码笔记', reason: '提高代码质量' },
        ],
      }
      const suggestions2: SmartTodoResult = {
        suggestions: [
          { title: '整理代码笔记', reason: '提高代码质量' },
          { title: '学习新技术', reason: '技术成长' },
        ],
      }
      const embedding = new IdenticalEmbeddingProvider()

      // First call - all suggestions are new
      const llm1 = new StubLlmProvider(suggestions1)
      const todo = new SmartTodo({
        llm: llm1,
        embedding,
        persona: TEST_PERSONA,
        similarityThreshold: 0.95,
      })
      const result1 = await todo.generate(makeProcessedContext(Date.now()), [])
      expect(result1.suggestions).toHaveLength(1)

      // Second call - identical embedding means high similarity, should be filtered
      todo.setLlmProvider(new StubLlmProvider(suggestions2))
      const result2 = await todo.generate(makeProcessedContext(Date.now()), [])
      // With identical embeddings (similarity = 1.0), all suggestions should be filtered as duplicates
      expect(result2.suggestions.length).toBeLessThan(suggestions2.suggestions.length)
    })

    it('returns empty suggestions when LLM returns no suggestions', async () => {
      const llm = new StubLlmProvider({ suggestions: [] })
      const embedding = new StubEmbeddingProvider()
      const todo = new SmartTodo({ llm, embedding, persona: TEST_PERSONA })

      const result = await todo.generate(makeProcessedContext(Date.now()), [])

      expect(result.suggestions).toEqual([])
    })

    it('calls onTodo callback with generated suggestions', async () => {
      const results: SmartTodoResult[] = []
      const llm = new StubLlmProvider(SAMPLE_SUGGESTIONS)
      const embedding = new StubEmbeddingProvider()
      const todo = new SmartTodo({
        llm,
        embedding,
        persona: TEST_PERSONA,
        onTodo: r => results.push(r),
      })

      await todo.generate(makeProcessedContext(Date.now()), [])

      expect(results).toHaveLength(1)
      expect(results[0].suggestions.length).toBeGreaterThan(0)
    })

    it('does not call onTodo when no suggestions generated', async () => {
      const results: SmartTodoResult[] = []
      const llm = new StubLlmProvider({ suggestions: [] })
      const embedding = new StubEmbeddingProvider()
      const todo = new SmartTodo({
        llm,
        embedding,
        persona: TEST_PERSONA,
        onTodo: r => results.push(r),
      })

      await todo.generate(makeProcessedContext(Date.now()), [])

      expect(results).toHaveLength(0)
    })

    it('forwards LLM errors to onError callback', async () => {
      const errors: Error[] = []
      const llm: LlmProvider = {
        async generateText() { throw new Error('LLM connection refused') },
        async generateStructured() { throw new Error('LLM connection refused') },
      }
      const embedding = new StubEmbeddingProvider()
      const todo = new SmartTodo({
        llm,
        embedding,
        persona: TEST_PERSONA,
        onError: (err: Error) => errors.push(err),
      })

      const result = await todo.generate(makeProcessedContext(Date.now()), [])

      expect(result.suggestions).toEqual([])
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toContain('SmartTodo')
    })

    it('re-throws LLM errors when no onError is set', async () => {
      const llm: LlmProvider = {
        async generateText() { throw new Error('LLM connection refused') },
        async generateStructured() { throw new Error('LLM connection refused') },
      }
      const embedding = new StubEmbeddingProvider()
      const todo = new SmartTodo({ llm, embedding, persona: TEST_PERSONA })

      await expect(
        todo.generate(makeProcessedContext(Date.now()), []),
      ).rejects.toThrow('SmartTodo')
    })

    it('validates LLM output and filters invalid suggestions', async () => {
      const invalidResult = { suggestions: [{ title: 123, reason: 'bad' }, { title: 'valid', reason: 'good' }] }
      const llm = new StubLlmProvider(invalidResult)
      const embedding = new StubEmbeddingProvider()
      const todo = new SmartTodo({ llm, embedding, persona: TEST_PERSONA })

      const result = await todo.generate(makeProcessedContext(Date.now()), [])

      expect(result.suggestions).toHaveLength(1)
      expect(result.suggestions[0].title).toBe('valid')
    })

    it('includes suggestion when embedding fails (graceful degradation)', async () => {
      const suggestions: SmartTodoResult = {
        suggestions: [{ title: 'test todo', reason: 'test reason' }],
      }
      const llm = new StubLlmProvider(suggestions)
      const throwingEmbedding: EmbeddingProvider = {
        dimension: 8,
        async embed() { throw new Error('Embedding API down') },
      }
      const todo = new SmartTodo({ llm, embedding: throwingEmbedding, persona: TEST_PERSONA })

      const result = await todo.generate(makeProcessedContext(Date.now()), [])

      expect(result.suggestions).toHaveLength(1)
      expect(result.suggestions[0].title).toBe('test todo')
    })

    it('includes screenshot context when available', async () => {
      const llm = new StubLlmProvider(SAMPLE_SUGGESTIONS)
      const embedding = new StubEmbeddingProvider()
      const todo = new SmartTodo({ llm, embedding, persona: TEST_PERSONA })

      const now = Date.now()
      const context = makeProcessedContext(now, {
        screenshot: {
          description: 'User reading project management board in Jira',
          entities: ['Chrome', 'Jira'],
          activity: 'project-management',
          timestamp: now,
          hash: '0'.repeat(64),
        },
      })

      await todo.generate(context, [])

      expect(llm.calls[0].prompt).toContain('User reading project management board in Jira')
    })
  })

  describe('dedup state management', () => {
    it('clearHistory resets dedup state', async () => {
      const suggestions: SmartTodoResult = {
        suggestions: [
          { title: '整理代码', reason: '保持代码质量' },
        ],
      }
      const embedding = new IdenticalEmbeddingProvider()
      const llm = new StubLlmProvider(suggestions)
      const todo = new SmartTodo({
        llm,
        embedding,
        persona: TEST_PERSONA,
        similarityThreshold: 0.95,
      })

      // First call stores embeddings
      await todo.generate(makeProcessedContext(Date.now()), [])

      // Clear history
      todo.clearHistory()

      // Same suggestion should pass through after clear
      todo.setLlmProvider(new StubLlmProvider(suggestions))
      const result = await todo.generate(makeProcessedContext(Date.now()), [])
      expect(result.suggestions).toHaveLength(1)
    })
  })
})
