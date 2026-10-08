import { defineConfig } from 'vitest/config'
import base from './vitest.config.ts'

// Retain the member's existing test/hook deadlines. This runs only acceptance resources.
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['acceptance/**/*.acceptance.ts'],
    maxWorkers: 1,
    fileParallelism: false,
  },
})
