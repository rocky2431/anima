import type { LanguageModelV3 } from '@ai-sdk/provider'

import type { AiOrchestrator } from './ai-orchestrator'
import type { AnimaOrchestrator, AnimaProactiveEvent } from './orchestrator'

import { env } from 'node:process'

import { createOpenAI } from '@ai-sdk/openai'
import { useLogg } from '@guiiai/logg'

const log = useLogg('anima-bridge').useGlobalConfig()

export interface BridgeDeps {
  animaOrchestrator: AnimaOrchestrator
  aiOrchestrator: AiOrchestrator
}

/**
 * Bridge between the Proactive pipeline (orchestrator.ts) and the AI reactive pipeline (ai-orchestrator.ts).
 *
 * When a proactive trigger fires, the bridge:
 * 1. Takes the trigger context and emotion
 * 2. Passes it to the AI Orchestrator for enriched response generation
 * 3. Falls back to the template response if AI generation fails or no model is configured
 *
 * The enriched responses are returned via the onEnrichedResponse callback,
 * which the caller wires to the WebSocket server for frontend delivery.
 */
export interface AnimaBridge {
  stop: () => void
}

export interface BridgeConfig {
  /** Called when an enriched response is ready for the frontend */
  onEnrichedResponse?: (event: {
    text: string
    emotion: string
    triggerId: string
    isAiGenerated: boolean
  }) => void
}

/**
 * Queue of pending proactive events, filled by the orchestrator callback
 * and drained by the bridge polling loop.
 */
const pendingProactiveEvents: AnimaProactiveEvent[] = []

/**
 * Called from setup-orchestrator.ts onProactiveResponse to enqueue events.
 */
export function enqueueProactiveEvent(event: AnimaProactiveEvent): void {
  pendingProactiveEvents.push(event)
}

function createBridgeModel(): LanguageModelV3 | null {
  const apiKey = env.ANASE_LLM_API_KEY ?? env.ANASE_VLM_API_KEY
  const modelId = env.ANASE_LLM_MODEL ?? 'gpt-4o-mini'
  const baseURL = env.ANASE_LLM_BASE_URL

  if (!apiKey) {
    return null
  }

  const openai = createOpenAI({ apiKey, baseURL: baseURL || undefined })
  return openai(modelId)
}

export function setupBridge(deps: BridgeDeps, config?: BridgeConfig): AnimaBridge {
  const model = createBridgeModel()
  let stopped = false

  if (!model) {
    log.warn('No LLM API key configured — bridge will use template responses only. Set ANASE_LLM_API_KEY for AI-enriched proactive responses.')
  }

  // Poll for pending proactive events and enrich them
  const pollTimer = setInterval(async () => {
    if (stopped || pendingProactiveEvents.length === 0) {
      return
    }

    const event = pendingProactiveEvents.shift()
    if (!event) {
      return
    }

    let text = event.response.message
    let isAiGenerated = false

    // Try to enrich via AI Orchestrator if model is available
    if (model) {
      try {
        const result = await deps.aiOrchestrator.generate(model, [
          {
            role: 'user',
            content: `You are a caring AI companion. A proactive trigger "${event.response.triggerId}" fired with emotion "${event.response.emotion}". The template response is: "${event.response.message}". Please generate a natural, contextual response that feels personal and caring. Keep it concise (1-2 sentences). Respond in the same language as the template.`,
          },
        ])

        if (result.text) {
          text = result.text
          isAiGenerated = true
        }
      }
      catch (err) {
        log.withError(err).warn('AI enrichment failed, using template response')
      }
    }

    config?.onEnrichedResponse?.({
      text,
      emotion: event.response.emotion,
      triggerId: event.response.triggerId,
      isAiGenerated,
    })
  }, 2_000)

  return {
    stop() {
      stopped = true
      clearInterval(pollTimer)
      pendingProactiveEvents.length = 0
    },
  }
}
