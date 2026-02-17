import type { ScreenshotProvider } from '@proj-airi/context-engine'
import { useLogg } from '@guiiai/logg'
import { desktopCapturer } from 'electron'

import { ScreenshotCapture } from '@proj-airi/context-engine'

const log = useLogg('context-engine').useGlobalConfig()

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
 * Initialize the ContextEngine service for the main process,
 * wiring platform-specific providers.
 */
export function setupContextEngine() {
  const provider = new ElectronScreenshotProvider()
  const screenshotCapture = new ScreenshotCapture(provider)

  log.info('ContextEngine initialized')

  return {
    screenshotCapture,
  }
}
