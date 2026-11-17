import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['acceptance/**/*.acceptance.ts'],
    testTimeout: 600_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
})
