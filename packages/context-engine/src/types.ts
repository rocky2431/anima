/**
 * Represents a single user activity event observed by the system.
 */
export interface ActivityEvent {
  /** Unix timestamp in milliseconds */
  timestamp: number
  /** Name of the foreground application */
  appName: string
  /** Title of the active window */
  windowTitle: string
  /** Whether the app is running in fullscreen mode */
  isFullscreen: boolean
}

/**
 * Aggregated activity context derived from a series of ActivityEvents.
 */
export interface ActivityContext {
  /** Duration of continuous work in milliseconds */
  continuousWorkDurationMs: number
  /** Current foreground application name */
  currentApp: string
  /** Current active window title */
  currentWindowTitle: string
  /** Whether the current app is in fullscreen */
  isFullscreen: boolean
  /** Timestamp of the last observed activity */
  lastActivityTimestamp: number
}

/**
 * Interface for capturing screenshots.
 * Implementations wrap platform-specific APIs (e.g., Electron desktopCapturer).
 */
export interface ScreenshotProvider {
  capture: () => Promise<Buffer>
}

/**
 * Result of a screenshot capture operation.
 */
export interface ScreenshotResult {
  /** Raw image data */
  buffer: Buffer
  /** Capture timestamp in milliseconds */
  timestamp: number
}

/**
 * Interface for Vision Language Model providers.
 * Implementations wrap specific LLM SDKs (e.g., AI SDK 6, xsAI).
 */
export interface VlmProvider {
  describeImage: (imageBuffer: Buffer) => Promise<VlmResult>
}

/**
 * Raw result from a VLM image description call.
 */
export interface VlmResult {
  /** Natural language description of what the user is doing */
  description: string
  /** Entities detected in the screenshot (apps, tools, content types) */
  entities: string[]
  /** High-level activity category (e.g., 'coding', 'browsing', 'writing') */
  activity: string
}

/**
 * Processed screenshot context after VLM understanding and pHash computation.
 * This is the final output of the screenshot pipeline.
 */
export interface ProcessedScreenshotContext {
  /** Natural language description */
  description: string
  /** Detected entities */
  entities: string[]
  /** Activity category */
  activity: string
  /** Capture timestamp in milliseconds */
  timestamp: number
  /** 64-bit perceptual hash as a binary string */
  hash: string
}
