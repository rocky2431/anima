import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: 'airi-brain',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
