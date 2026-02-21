import type { ScreenshotProvider, VlmProvider, VlmResult } from '@proj-airi/context-engine'

import { env } from 'node:process'

import { createOpenAI } from '@ai-sdk/openai'
import { useLogg } from '@guiiai/logg'
import { generateText } from 'ai'
import { desktopCapturer } from 'electron'

import { createAnimaOrchestrator } from './orchestrator'
import { enqueueProactiveEvent } from './setup-bridge'

const log = useLogg('anima-orchestrator').useGlobalConfig()

/**
 * Electron desktopCapturer-based screenshot provider.
 * Uses the primary display source for periodic screenshot capture.
 */
class ElectronScreenshotProvider implements ScreenshotProvider {
  async capture(): Promise<Buffer> {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 },
    })

    const primarySource = sources[0]
    if (!primarySource) {
      throw new Error('No screen sources available from desktopCapturer. Check screen recording permissions.')
    }

    return primarySource.thumbnail.toPNG()
  }
}

/**
 * Returns a generic activity description without calling any VLM API.
 * Logs a one-time warning on first invocation.
 */
class NoOpVlmProvider implements VlmProvider {
  private warned = false

  async describeImage(_imageBuffer: Buffer): Promise<VlmResult> {
    if (!this.warned) {
      log.warn('VLM provider not configured: returning generic activity description. Set AIRI_VLM_API_KEY + AIRI_VLM_MODEL for AI-powered screen analysis.')
      this.warned = true
    }
    return {
      description: 'User is working at their computer',
      entities: [],
      activity: 'working',
    }
  }
}

const VLM_SYSTEM_PROMPT = `You are a screen activity analyzer. Given a screenshot, describe:
1. What the user is currently doing (one sentence)
2. What entities are visible (app names, tools, content types)
3. The high-level activity category

Respond in valid JSON with this exact structure:
{"description": "...", "entities": ["...", "..."], "activity": "coding|browsing|writing|designing|communicating|entertainment|reading|other"}`

/**
 * AI SDK-based VLM provider that sends screenshots to a vision-capable LLM.
 * Supports any OpenAI-compatible API (OpenAI, Claude via proxy, local models).
 */
class AiSdkVlmProvider implements VlmProvider {
  private readonly model: ReturnType<ReturnType<typeof createOpenAI>>

  constructor(apiKey: string, modelId: string, baseURL?: string) {
    const openai = createOpenAI({ apiKey, baseURL: baseURL || undefined })
    this.model = openai(modelId)
  }

  async describeImage(imageBuffer: Buffer): Promise<VlmResult> {
    const result = await generateText({
      model: this.model,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', image: imageBuffer },
          { type: 'text', text: VLM_SYSTEM_PROMPT },
        ],
      }],
      maxOutputTokens: 300,
    })

    try {
      const parsed = JSON.parse(result.text) as VlmResult
      return {
        description: typeof parsed.description === 'string' ? parsed.description : 'User is at their computer',
        entities: Array.isArray(parsed.entities) ? parsed.entities : [],
        activity: typeof parsed.activity === 'string' ? parsed.activity : 'other',
      }
    }
    catch {
      return {
        description: result.text.slice(0, 200),
        entities: [],
        activity: 'other',
      }
    }
  }
}

function createVlmProvider(): VlmProvider {
  const apiKey = env.AIRI_VLM_API_KEY
  const model = env.AIRI_VLM_MODEL
  const baseURL = env.AIRI_VLM_BASE_URL

  if (apiKey && model) {
    log.log('VLM provider configured', { model, hasBaseURL: !!baseURL })
    return new AiSdkVlmProvider(apiKey, model, baseURL)
  }

  return new NoOpVlmProvider()
}

/**
 * Initialize the Anima orchestrator for the main process.
 * Wires: ScreenshotPipeline → ActivityMonitor → PersonaEngine → ProactiveResponse.
 */
const MAX_CONSECUTIVE_ERRORS = 5

export function setupAnimaOrchestrator() {
  const screenshotProvider = new ElectronScreenshotProvider()
  const vlmProvider = createVlmProvider()

  let consecutiveErrors = 0
  let orchestratorRef: ReturnType<typeof createAnimaOrchestrator> | null = null

  const orchestrator = createAnimaOrchestrator(
    { screenshotProvider, vlmProvider },
    {
      initialIntimacyScore: 0,
      onProactiveResponse: (event) => {
        consecutiveErrors = 0
        log.log('Proactive trigger fired', {
          triggerId: event.response.triggerId,
          emotion: event.response.emotion,
          animaEmotion: event.animaEmotion,
          message: event.response.message,
        })
        // Enqueue for AI enrichment via the bridge
        enqueueProactiveEvent(event)
      },
      onError: (error) => {
        consecutiveErrors++
        log.withError(error).error(`Anima orchestrator error (consecutive: ${consecutiveErrors})`)

        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS && orchestratorRef) {
          log.error(`Stopping orchestrator after ${consecutiveErrors} consecutive errors`)
          orchestratorRef.stop()
        }
      },
    },
  )

  orchestratorRef = orchestrator
  orchestrator.start()

  log.log('Anima orchestrator initialized and started')

  return orchestrator
}
