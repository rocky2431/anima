import type { Tool as XsaiTool } from '@xsai/shared-chat'

import { env } from 'node:process'

import { tool as xsaiTool } from '@xsai/tool'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  convertXsaiToolsToAiSdk,
  createAiSdkModel,
} from './use-ai-sdk'

// Test fixtures for unit testing model creation — no real HTTP calls are made.
const TEST_BASE_URL = env.TEST_AI_SDK_BASE_URL ?? 'test-base-url'
const TEST_API_KEY = env.TEST_AI_SDK_API_KEY ?? 'sk-test-000'

describe('convertXsaiToolsToAiSdk', () => {
  it('should convert a simple xsAI tool with empty parameters', async () => {
    const resolved = await xsaiTool({
      name: 'test_tool',
      description: 'A test tool',
      execute: async () => 'hello',
      parameters: z.object({}),
    })

    const result = convertXsaiToolsToAiSdk([resolved])

    expect(result).toHaveProperty('test_tool')
    expect(result.test_tool).toBeDefined()
    expect(result.test_tool.description).toBe('A test tool')
  })

  it('should convert a tool with complex parameters', async () => {
    const resolved = await xsaiTool({
      name: 'complex_tool',
      description: 'A tool with complex params',
      execute: async ({ name, count }: { name: string, count: number }) => {
        return `${name}: ${count}`
      },
      parameters: z.object({
        name: z.string().describe('The name'),
        count: z.number().describe('The count'),
      }),
    })

    const result = convertXsaiToolsToAiSdk([resolved])

    expect(result).toHaveProperty('complex_tool')
    expect(result.complex_tool.description).toBe('A tool with complex params')
  })

  it('should convert multiple tools into a keyed record', async () => {
    const tool1 = await xsaiTool({
      name: 'tool_alpha',
      description: 'Alpha tool',
      execute: async () => 'alpha',
      parameters: z.object({}),
    })
    const tool2 = await xsaiTool({
      name: 'tool_beta',
      description: 'Beta tool',
      execute: async () => 'beta',
      parameters: z.object({}),
    })

    const result = convertXsaiToolsToAiSdk([tool1, tool2])

    expect(Object.keys(result)).toEqual(['tool_alpha', 'tool_beta'])
    expect(result.tool_alpha.description).toBe('Alpha tool')
    expect(result.tool_beta.description).toBe('Beta tool')
  })

  it('should preserve execute functions that produce correct output', async () => {
    const resolved = await xsaiTool({
      name: 'echo_tool',
      description: 'Echoes input',
      execute: async ({ message }: { message: string }) => message,
      parameters: z.object({
        message: z.string(),
      }),
    })

    const result = convertXsaiToolsToAiSdk([resolved])
    const tool = result.echo_tool

    const output = await tool.execute({ message: 'hello world' }, {
      toolCallId: 'test-id',
      messages: [],
    })
    expect(output).toBe('hello world')
  })

  it('should handle tools without description', async () => {
    const resolved: XsaiTool = {
      type: 'function',
      function: {
        name: 'no_desc_tool',
        parameters: { type: 'object', properties: {} },
      },
      execute: async () => 'ok',
    }

    const result = convertXsaiToolsToAiSdk([resolved])

    expect(result).toHaveProperty('no_desc_tool')
    expect(result.no_desc_tool.description).toBeUndefined()
  })

  it('should return empty record for empty tools array', () => {
    const result = convertXsaiToolsToAiSdk([])
    expect(result).toEqual({})
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
