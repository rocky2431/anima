import { env } from 'node:process'

import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { tool } from '../libs/ai/tool'
import { createAiSdkModel } from './use-ai-sdk'

// Test fixtures for unit testing model creation -- no real HTTP calls are made.
const TEST_BASE_URL = env.TEST_AI_SDK_BASE_URL ?? 'test-base-url'
const TEST_API_KEY = env.TEST_AI_SDK_API_KEY ?? 'sk-test-000'

describe('tool() factory', () => {
  it('should produce a NamedTool with correct name and description', () => {
    const result = tool({
      name: 'test_tool',
      description: 'A test tool',
      execute: async () => 'hello',
      parameters: z.object({}),
    })

    expect(result.name).toBe('test_tool')
    expect(result.tool).toBeDefined()
    expect(result.tool.description).toBe('A test tool')
  })

  it('should produce an AI SDK tool with working execute', async () => {
    const result = tool({
      name: 'echo_tool',
      description: 'Echoes input',
      execute: async ({ message }: { message: string }) => message,
      parameters: z.object({
        message: z.string(),
      }),
    })

    const output = await result.tool.execute!({ message: 'hello world' }, {
      toolCallId: 'test-id',
      messages: [],
    })
    expect(output).toBe('hello world')
  })

  it('should build a ToolSet from multiple NamedTools', () => {
    const t1 = tool({
      name: 'tool_alpha',
      description: 'Alpha tool',
      execute: async () => 'alpha',
      parameters: z.object({}),
    })
    const t2 = tool({
      name: 'tool_beta',
      description: 'Beta tool',
      execute: async () => 'beta',
      parameters: z.object({}),
    })

    const toolSet = Object.fromEntries([t1, t2].map(t => [t.name, t.tool]))

    expect(Object.keys(toolSet)).toEqual(['tool_alpha', 'tool_beta'])
    expect(toolSet.tool_alpha.description).toBe('Alpha tool')
    expect(toolSet.tool_beta.description).toBe('Beta tool')
  })
})

describe('createAiSdkModel', () => {
  it('should create a model instance from OpenAI-compatible config', () => {
    const model = createAiSdkModel({
      baseURL: TEST_BASE_URL,
      apiKey: TEST_API_KEY,
      modelId: 'gpt-4o',
    })

    expect(model).toBeDefined()
    expect(model.modelId).toBe('gpt-4o')
  })

  it('should normalize base URL without trailing slash', () => {
    const baseWithoutSlash = TEST_BASE_URL.replace(/\/$/, '')
    const model = createAiSdkModel({
      baseURL: baseWithoutSlash,
      apiKey: TEST_API_KEY,
      modelId: 'openai/gpt-4o',
    })

    expect(model).toBeDefined()
    expect(model.modelId).toBe('openai/gpt-4o')
  })

  it('should create model with custom headers', () => {
    const model = createAiSdkModel({
      baseURL: TEST_BASE_URL,
      apiKey: TEST_API_KEY,
      modelId: 'custom-model',
      headers: { 'X-Custom': 'value' },
    })

    expect(model).toBeDefined()
    expect(model.modelId).toBe('custom-model')
  })

  it('should create Anthropic model when provider is anthropic', () => {
    const model = createAiSdkModel({
      baseURL: TEST_BASE_URL,
      apiKey: TEST_API_KEY,
      modelId: 'claude-sonnet-4-5',
      provider: 'anthropic',
    })

    expect(model).toBeDefined()
    expect(model.modelId).toContain('claude-sonnet-4-5')
  })
})
