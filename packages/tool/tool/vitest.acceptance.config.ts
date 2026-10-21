import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['acceptance/**/*.acceptance.ts'],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
})
