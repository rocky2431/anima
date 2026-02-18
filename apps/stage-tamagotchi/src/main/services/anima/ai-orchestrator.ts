import type { LanguageModelV2 } from '@ai-sdk/provider'
import type { Skill } from '@proj-airi/skills-engine'

import { useLogg } from '@guiiai/logg'
import { McpHub } from '@proj-airi/mcp-hub'
import { buildSkillsContext, SkillRegistry } from '@proj-airi/skills-engine'
import { generateText, stepCountIs } from 'ai'

const DEFAULT_MAX_STEPS = 5

/**
 * Configuration for the AI orchestrator that combines
 * MCP tool aggregation, skills context injection, and AI SDK generation.
 */
export interface AiOrchestratorConfig {
  /** Path to the MCP hub SQLite database */
  readonly mcpDbPath: string
  /** Path to built-in skills directory */
  readonly builtinSkillsDir: string
  /** Path to user skills directory */
  readonly userSkillsDir: string
  /** Base system prompt prepended before skills context */
  readonly baseSystemPrompt?: string
}

export interface InitResult {
  readonly mcpConnected: string[]
  readonly mcpFailed: Array<{ id: string, error: string }>
  readonly skillsLoaded: number
  readonly skillsError?: string
}

export interface GenerateResult {
  readonly text: string
  readonly finishReason: string
  readonly toolCalls: Array<{ toolName: string, args: unknown }>
  readonly toolResults: Array<{ toolName: string, result: unknown }>
  readonly usage: { readonly inputTokens: number | undefined, readonly outputTokens: number | undefined }
}

/**
 * AI Orchestrator: wires McpHub (tools) + SkillRegistry (system prompt) + AI SDK (LLM calls).
 *
 * Imperative Shell that orchestrates the AI layer. The orchestrator:
 * 1. Manages MCP server connections and aggregates tools
 * 2. Loads skills and builds system prompts with skills context
 * 3. Calls AI SDK generateText with combined system prompt + MCP tools
 */
export interface AiOrchestrator {
  /** The underlying MCP hub instance */
  readonly mcpHub: McpHub
  /** The underlying skill registry instance */
  readonly skillRegistry: SkillRegistry
  /** Connect enabled MCP servers and load all skills */
  initialize: () => Promise<InitResult>
  /** Build a system prompt with skills context injected */
  buildSystemPrompt: (activeSkillIds?: string[]) => string
  /** Get aggregated tools from all connected MCP servers */
  getTools: () => Promise<Record<string, unknown>>
  /** Generate text using AI SDK with system prompt + MCP tools */
  generate: (
    model: LanguageModelV2,
    messages: Array<{ role: 'user' | 'assistant', content: string }>,
    options?: { maxSteps?: number },
  ) => Promise<GenerateResult>
  /** Shut down MCP connections and release resources */
  shutdown: () => Promise<void>
}

export function createAiOrchestrator(config: AiOrchestratorConfig): AiOrchestrator {
  const log = useLogg('ai-orchestrator').useGlobalConfig()

  const mcpHub = new McpHub(config.mcpDbPath)
  const skillRegistry = new SkillRegistry({
    builtinSkillsDir: config.builtinSkillsDir,
    userSkillsDir: config.userSkillsDir,
  })

  const basePrompt = config.baseSystemPrompt ?? ''

  return {
    mcpHub,
    skillRegistry,

    async initialize(): Promise<InitResult> {
      log.log('Initializing AI orchestrator...')

      const [mcpSettled, skillsSettled] = await Promise.allSettled([
        mcpHub.connectEnabled(),
        skillRegistry.loadAll(),
      ])

      const mcpResult = mcpSettled.status === 'fulfilled' ? mcpSettled.value : null
      const skillsError = skillsSettled.status === 'rejected'
        ? String(skillsSettled.reason)
        : undefined

      const result: InitResult = {
        mcpConnected: mcpResult?.connected ?? [],
        mcpFailed: mcpResult
          ? mcpResult.failed.map((f: { id: string, error: unknown }) => ({
              id: f.id,
              error: String(f.error),
            }))
          : [],
        skillsLoaded: skillsSettled.status === 'fulfilled'
          ? skillRegistry.getAll().length
          : 0,
        skillsError,
      }

      log.withFields({
        mcpConnected: result.mcpConnected.length,
        mcpFailed: result.mcpFailed.length,
        skillsLoaded: result.skillsLoaded,
        skillsError: result.skillsError,
      }).log('AI orchestrator initialized')

      return result
    },

    buildSystemPrompt(activeSkillIds?: string[]): string {
      if (activeSkillIds) {
        for (const id of activeSkillIds) {
          skillRegistry.activate(id)
        }
      }

      const allSkills: Skill[] = skillRegistry.getAll().map(e => e.skill)
      const activeSkills: Skill[] = skillRegistry.getActive()
      const skillsContext = buildSkillsContext(allSkills, activeSkills)

      const parts: string[] = []
      if (basePrompt) {
        parts.push(basePrompt)
      }
      if (skillsContext) {
        parts.push(skillsContext)
      }

      return parts.join('\n\n')
    },

    async getTools(): Promise<Record<string, unknown>> {
      return mcpHub.aggregateTools()
    },

    async generate(model, messages, options = {}): Promise<GenerateResult> {
      const systemPrompt = this.buildSystemPrompt()
      const tools = await this.getTools()

      log.withFields({ modelId: model.modelId, messageCount: messages.length }).log('Generating text')

      try {
        const result = await generateText({
          model,
          system: systemPrompt,
          messages: messages as Array<{ role: 'user' | 'assistant', content: string }>,
          tools: tools as Parameters<typeof generateText>[0]['tools'],
          stopWhen: stepCountIs(options.maxSteps ?? DEFAULT_MAX_STEPS),
        })

        log.withFields({
          finishReason: result.finishReason,
          inputTokens: result.usage?.inputTokens,
          outputTokens: result.usage?.outputTokens,
        }).log('Generation complete')

        return {
          text: result.text,
          finishReason: result.finishReason,
          toolCalls: (result.toolCalls ?? []).map((tc: { toolName: string, args?: unknown }) => ({
            toolName: tc.toolName,
            args: tc.args,
          })),
          toolResults: (result.toolResults ?? []).map((tr: { toolName: string, result?: unknown }) => ({
            toolName: tr.toolName,
            result: tr.result,
          })),
          usage: {
            inputTokens: result.usage?.inputTokens,
            outputTokens: result.usage?.outputTokens,
          },
        }
      }
      catch (err) {
        log.withError(err).withFields({ modelId: model.modelId, messageCount: messages.length }).error('Generation failed')
        throw new Error(`AI orchestrator generate failed (model: ${model.modelId})`, { cause: err })
      }
    },

    async shutdown(): Promise<void> {
      log.log('Shutting down AI orchestrator...')
      try {
        await mcpHub.shutdown()
        log.log('AI orchestrator shut down')
      }
      catch (err) {
        log.withError(err).error('AI orchestrator shutdown failed')
        throw new Error('AI orchestrator shutdown failed', { cause: err })
      }
    },
  }
}
