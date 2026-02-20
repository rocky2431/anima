import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      'apps/server',
      'apps/stage-tamagotchi',
      'packages/channels-extra',
      'packages/context-engine',
      'packages/cron-service',
      'packages/desktop-shell',
      'packages/mcp-hub',
      'packages/persona-engine',
      'packages/skills-engine',
      'packages/stage-ui',
      'packages/plugin-sdk',
      'packages/vite-plugin-warpdrive',
      'packages/audio-pipelines-transcribe',
      'packages/server-runtime',
    ],
  },
})
