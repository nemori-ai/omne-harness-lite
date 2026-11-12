import { defineConfig } from 'vitest/config'
import { testTiers } from '../../../vitest.tiers.mts'

export default defineConfig(({ mode }) => {
  const tiers = testTiers(mode)
  return {
    test: {
      ...tiers,
      // Every case file fails on a rejection nobody handled or an uncaught exception.
      setupFiles: ['./tests/unhandled.ts'],
      include: ['tests/**/*.spec.ts'],
      typecheck: {
        ...tiers.typecheck,
        enabled: true,
        include: ['tests/**/*.spec-d.ts'],
        tsconfig: './tsconfig.test.json',
      },
    },
  }
})
