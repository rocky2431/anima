import type { LanguageModelV2, LanguageModelV2CallOptions } from '@ai-sdk/provider'
import type { Skill } from '@proj-airi/skills-engine'

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { McpHub } from '@proj-airi/mcp-hub'
import { buildSkillsContext, SkillRegistry } from '@proj-airi/skills-engine'
import { generateText, stepCountIs } from 'ai'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createAiOrchestrator } from './ai-orchestrator'

const ECHO_SERVER = path.resolve(
  import.meta.dirname,
  '../../../../../../packages/mcp-hub/src/__tests__/fixtures/echo-mcp-server.ts',
)

const BUILTIN_SKILLS_DIR = path.resolve(
  import.meta.dirname,
  '../../../../../../packages/skills-engine/skills',
)

/**
 * Test Double rationale: LanguageModelV2 is an external LLM API
 * (Anthropic/OpenAI). External LLM calls are rate-limited, cost money,
 * and are unavailable in CI. This test double implements the LanguageModelV2
 * interface to return predictable results for integration testing.
 */
function createTestModel(options: {
  generateResult?: (opts: LanguageModelV2CallOptions) => {
    content: Array<{ type: 'text', text: string } | { type: 'tool-call', toolCallId: string, toolName: string, input: string }>
    finishReason: 'stop' | 'tool-calls'
  }
} = {}): LanguageModelV2 {
  return {
    specificationVersion: 'v2',
    provider: 'test-provider',
    modelId: 'test-model',
    supportedUrls: {},

    doGenerate: async (callOptions: LanguageModelV2CallOptions) => {
      const result = options.generateResult?.(callOptions)
      return {
        content: result?.content ?? [{ type: 'text' as const, text: 'Hello from test model' }],
        finishReason: result?.finishReason ?? 'stop',
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        warnings: [],
      }
    },

    doStream: async () => ({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: 'text-start' as const, id: 'text-0', providerMetadata: undefined })
          controller.enqueue({ type: 'text-delta' as const, id: 'text-0', textDelta: 'Hello from test model' })
          controller.enqueue({ type: 'finish' as const, finishReason: 'stop' as const, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } })
          controller.close()
        },
      }),
    }),
  }
}

describe('ai Orchestrator Integration: AI SDK + MCP + Skills', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-orchestrator-integration-'))
  })

  afterEach(async () => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('aI SDK 6 generateText returns correct result', () => {
    it('generates text response via AI SDK generateText', async () => {
      const model = createTestModel()

      const result = await generateText({
        model,
        messages: [{ role: 'user' as const, content: 'Say hello' }],
      })

      expect(result.text).toBe('Hello from test model')
      expect(result.finishReason).toBe('stop')
      expect(result.usage.inputTokens).toBe(10)
      expect(result.usage.outputTokens).toBe(5)
    })

    it('generateText supports system prompt injection', async () => {
      let receivedSystem: string | undefined
      const model = createTestModel({
        generateResult: (opts) => {
          const systemMsg = opts.prompt.find(
            (m: { role: string }) => m.role === 'system',
          )
          receivedSystem = systemMsg
            ? (systemMsg as { content: string }).content
            : undefined
          return {
            content: [{ type: 'text', text: 'Response with system prompt' }],
            finishReason: 'stop',
          }
        },
      })

      await generateText({
        model,
        system: 'You are a helpful companion.',
        messages: [{ role: 'user' as const, content: 'Hello' }],
      })

      expect(receivedSystem).toContain('helpful companion')
    })
  })

  describe('mCP Server connection and tool aggregation', () => {
    let hub: McpHub

    beforeEach(() => {
      const dbPath = path.join(tmpDir, 'mcp-hub.db')
      hub = new McpHub(dbPath)
    })

    afterEach(async () => {
      await hub.shutdown()
    })

    it('connects to MCP server (echo) and aggregates tools', async () => {
      const config = hub.addServer({
        name: 'echo-server',
        transport: 'stdio',
        command: 'npx',
        args: ['tsx', ECHO_SERVER],
      })

      await hub.connectServer(config.id)
      expect(hub.getServerStatus(config.id)).toBe('connected')

      const tools = await hub.aggregateTools()
      const toolNames = Object.keys(tools)

      expect(toolNames.length).toBeGreaterThanOrEqual(2)
      expect(toolNames).toContain('echo')
      expect(toolNames).toContain('add')
    }, 30_000)

    it('aggregated tools are valid AI SDK tool format', async () => {
      const config = hub.addServer({
        name: 'echo-server',
        transport: 'stdio',
        command: 'npx',
        args: ['tsx', ECHO_SERVER],
      })

      await hub.connectServer(config.id)
      const tools = await hub.aggregateTools()

      // McpHub aggregated tools have a specific AI SDK-compatible structure
      for (const [name, tool] of Object.entries(tools)) {
        expect(name).toBeTruthy()
        expect(tool).toBeDefined()
        expect(typeof tool).toBe('object')
      }
    }, 30_000)
  })

  describe('skills metadata injection into system prompt', () => {
    it('loads built-in skills and builds context with skills metadata', async () => {
      const registry = new SkillRegistry({
        builtinSkillsDir: BUILTIN_SKILLS_DIR,
        userSkillsDir: '/nonexistent/path',
      })

      await registry.loadAll()

      const all = registry.getAll()
      expect(all.length).toBeGreaterThanOrEqual(2)

      registry.activate('companion-persona')

      const allSkills: Skill[] = all.map(e => e.skill)
      const activeSkills = registry.getActive()
      const context = buildSkillsContext(allSkills, activeSkills)

      // Layer 1: all skills appear in summary
      expect(context).toContain('companion-persona')
      expect(context).toContain('proactive-care')

      // Layer 2: only active skill body included
      expect(context).toContain('warm, caring AI companion')
    })

    it('skills context is suitable for system prompt injection', async () => {
      const registry = new SkillRegistry({
        builtinSkillsDir: BUILTIN_SKILLS_DIR,
        userSkillsDir: '/nonexistent/path',
      })

      await registry.loadAll()
      registry.activate('companion-persona')
      registry.activate('proactive-care')

      const allSkills: Skill[] = registry.getAll().map(e => e.skill)
      const activeSkills: Skill[] = registry.getActive()
      const context = buildSkillsContext(allSkills, activeSkills)

      // Verify it's a valid string that can be prepended to system prompt
      expect(typeof context).toBe('string')
      expect(context.length).toBeGreaterThan(0)

      // Both active skills' bodies should be present
      expect(context).toContain('warm, caring AI companion')
      expect(context).toContain('Morning Greeting')
    })
  })

  describe('agent Loop calls MCP tool and returns result', () => {
    let hub: McpHub

    beforeEach(() => {
      const dbPath = path.join(tmpDir, 'mcp-agent-loop.db')
      hub = new McpHub(dbPath)
    })

    afterEach(async () => {
      await hub.shutdown()
    })

    it('generateText with MCP tools allows tool invocation in agent loop', async () => {
      // Connect echo MCP server
      const config = hub.addServer({
        name: 'echo-server',
        transport: 'stdio',
        command: 'npx',
        args: ['tsx', ECHO_SERVER],
      })
      await hub.connectServer(config.id)
      const tools = await hub.aggregateTools()

      // Test Double rationale: LLM API is external, rate-limited, unavailable in CI.
      // This model simulates a tool call to 'echo' on first step, then returns text.
      let callCount = 0
      const model = createTestModel({
        generateResult: () => {
          callCount++
          if (callCount === 1) {
            // First call: model decides to call the 'echo' tool
            return {
              content: [{
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: 'echo',
                input: '{}',
              }],
              finishReason: 'tool-calls',
            }
          }
          // Second call: model sees tool result and generates final text
          return {
            content: [{ type: 'text', text: 'The echo tool returned: Echo: hello' }],
            finishReason: 'stop',
          }
        },
      })

      const result = await generateText({
        model,
        messages: [{ role: 'user' as const, content: 'Use the echo tool' }],
        tools: tools as Parameters<typeof generateText>[0]['tools'],
        stopWhen: stepCountIs(3),
      })

      // Agent loop should have completed with tool call + final text
      expect(callCount).toBeGreaterThanOrEqual(2)
      expect(result.text).toContain('echo')

      // Verify tool calls are recorded in steps
      const allStepToolCalls = result.steps.flatMap(s => s.toolCalls)
      expect(allStepToolCalls.length).toBeGreaterThanOrEqual(1)
      expect(allStepToolCalls[0].toolName).toBe('echo')

      const allStepToolResults = result.steps.flatMap(s => s.toolResults)
      expect(allStepToolResults.length).toBeGreaterThanOrEqual(1)
    }, 30_000)
  })

  describe('full integration: AiOrchestrator end-to-end', () => {
    it('creates orchestrator, initializes, builds prompt with skills, gets MCP tools, generates', async () => {
      const dbPath = path.join(tmpDir, 'ai-orchestrator.db')
      const orchestrator = createAiOrchestrator({
        mcpDbPath: dbPath,
        builtinSkillsDir: BUILTIN_SKILLS_DIR,
        userSkillsDir: '/nonexistent/path',
        baseSystemPrompt: 'You are Anima, an AI companion.',
      })

      try {
        // Register echo MCP server before initialization
        orchestrator.mcpHub.addServer({
          name: 'echo-server',
          transport: 'stdio',
          command: 'npx',
          args: ['tsx', ECHO_SERVER],
        })

        // Initialize: connect MCP + load skills
        const initResult = await orchestrator.initialize()
        expect(initResult.mcpConnected).toHaveLength(1)
        expect(initResult.mcpFailed).toHaveLength(0)
        expect(initResult.skillsLoaded).toBeGreaterThanOrEqual(2)

        // Build system prompt with skills activated
        const systemPrompt = orchestrator.buildSystemPrompt(['companion-persona'])
        expect(systemPrompt).toContain('You are Anima')
        expect(systemPrompt).toContain('companion-persona')
        expect(systemPrompt).toContain('warm, caring AI companion')

        // Get MCP tools
        const tools = await orchestrator.getTools()
        expect(Object.keys(tools)).toContain('echo')
        expect(Object.keys(tools)).toContain('add')

        // Generate with AI SDK (using test model)
        const model = createTestModel()
        const result = await orchestrator.generate(model, [
          { role: 'user', content: 'Hello, Anima!' },
        ])

        expect(result.text).toBe('Hello from test model')
        expect(result.finishReason).toBe('stop')
        expect(result.usage.inputTokens).toBe(10)
      }
      finally {
        await orchestrator.shutdown()
      }
    }, 30_000)

    it('orchestrator generate uses system prompt with skills and MCP tools together', async () => {
      const dbPath = path.join(tmpDir, 'ai-orchestrator-full.db')
      const orchestrator = createAiOrchestrator({
        mcpDbPath: dbPath,
        builtinSkillsDir: BUILTIN_SKILLS_DIR,
        userSkillsDir: '/nonexistent/path',
        baseSystemPrompt: 'You are Anima.',
      })

      try {
        orchestrator.mcpHub.addServer({
          name: 'echo-server',
          transport: 'stdio',
          command: 'npx',
          args: ['tsx', ECHO_SERVER],
        })

        await orchestrator.initialize()
        orchestrator.skillRegistry.activate('companion-persona')
        orchestrator.skillRegistry.activate('proactive-care')

        // Capture what the model receives
        let receivedPrompt: unknown[] = []
        let receivedToolDefs: Array<{ type: string, name: string }> = []
        const model = createTestModel({
          generateResult: (opts) => {
            receivedPrompt = opts.prompt
            receivedToolDefs = (opts.tools ?? []) as Array<{ type: string, name: string }>
            return {
              content: [{ type: 'text', text: 'Combined response' }],
              finishReason: 'stop',
            }
          },
        })

        await orchestrator.generate(model, [
          { role: 'user', content: 'How are you?' },
        ])

        // System prompt should contain skills context
        const systemMsg = receivedPrompt.find((m: any) => m.role === 'system') as any
        expect(systemMsg).toBeDefined()
        expect(systemMsg.content).toContain('Anima')
        expect(systemMsg.content).toContain('companion-persona')
        expect(systemMsg.content).toContain('proactive-care')

        // Tools should include MCP tools (passed to model as array of function tool defs)
        const receivedToolNames = receivedToolDefs.map(t => t.name)
        expect(receivedToolNames).toContain('echo')
        expect(receivedToolNames).toContain('add')
      }
      finally {
        await orchestrator.shutdown()
      }
    }, 30_000)

    it('initialize() reports skills loading error without throwing', async () => {
      const dbPath = path.join(tmpDir, 'ai-orchestrator-skills-error.db')
      const orchestrator = createAiOrchestrator({
        mcpDbPath: dbPath,
        builtinSkillsDir: '/completely/nonexistent/skills/dir/that/cannot/exist',
        userSkillsDir: '/nonexistent/path',
        baseSystemPrompt: 'Test prompt',
      })

      try {
        const initResult = await orchestrator.initialize()

        // Skills loading should have failed but not thrown
        expect(initResult.skillsLoaded).toBe(0)
        // MCP should still work (no servers registered = no connections)
        expect(initResult.mcpConnected).toHaveLength(0)
        expect(initResult.mcpFailed).toHaveLength(0)
      }
      finally {
        await orchestrator.shutdown()
      }
    }, 30_000)

    it('generate() wraps LLM errors with orchestrator context', async () => {
      const dbPath = path.join(tmpDir, 'ai-orchestrator-gen-error.db')
      const orchestrator = createAiOrchestrator({
        mcpDbPath: dbPath,
        builtinSkillsDir: BUILTIN_SKILLS_DIR,
        userSkillsDir: '/nonexistent/path',
      })

      try {
        await orchestrator.initialize()

        /**
         * Test Double rationale: LLM API is external and rate-limited.
         * This model simulates a network failure to verify error wrapping.
         */
        const failingModel = createTestModel({
          generateResult: () => {
            throw new Error('Network timeout: connection refused')
          },
        })

        await expect(
          orchestrator.generate(failingModel, [{ role: 'user', content: 'Hello' }]),
        ).rejects.toThrow('AI orchestrator generate failed')
      }
      finally {
        await orchestrator.shutdown()
      }
    }, 30_000)
  })
})
