/**
 * Minimal type declaration for @slack/bolt.
 *
 * @slack/bolt is a runtime-optional dependency loaded via dynamic import
 * in setup-channels.ts. This declaration satisfies the TypeScript compiler
 * without pulling the full package as a build-time dependency.
 */
declare module '@slack/bolt' {
  export class App {
    constructor(options: {
      token: string
      appToken: string
      socketMode?: boolean
      [key: string]: unknown
    })
    start(): Promise<void>
    stop(): Promise<void>
    message(pattern: string | RegExp, handler: (...args: unknown[]) => void): void
    event(name: string, handler: (...args: unknown[]) => void): void
  }
}
