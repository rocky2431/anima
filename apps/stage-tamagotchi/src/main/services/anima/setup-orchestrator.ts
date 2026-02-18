import type { ScreenshotProvider, VlmProvider, VlmResult } from '@proj-airi/context-engine'

import { useLogg } from '@guiiai/logg'
import { desktopCapturer } from 'electron'

import { createAnimaOrchestrator } from './orchestrator'

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
      log.warn('VLM provider not configured: returning generic activity description. Set up a VLM provider for AI-powered screen analysis.')
      this.warned = true
    }
    return {
      description: 'User is working at their computer',
      entities: [],
      activity: 'working',
    }
  }
}

/**
 * Initialize the Anima orchestrator for the main process.
 * Wires: ScreenshotPipeline → ActivityMonitor → PersonaEngine → ProactiveResponse.
 */
const MAX_CONSECUTIVE_ERRORS = 5

export function setupAnimaOrchestrator() {
  const screenshotProvider = new ElectronScreenshotProvider()
  const vlmProvider = new NoOpVlmProvider()

  let consecutiveErrors = 0
  let orchestratorRef: ReturnType<typeof createAnimaOrchestrator> | null = null

  const orchestrator = createAnimaOrchestrator(
    { screenshotProvider, vlmProvider },
    {
      initialIntimacyScore: 0,
      onProactiveResponse: (event) => {
        consecutiveErrors = 0
        log.info('Proactive trigger fired', {
          triggerId: event.response.triggerId,
          emotion: event.response.emotion,
          animaEmotion: event.animaEmotion,
          message: event.response.message,
        })
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

  log.info('Anima orchestrator initialized and started')

  return orchestrator
}
