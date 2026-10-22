import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['acceptance/**/*.acceptance.ts'],
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
})
