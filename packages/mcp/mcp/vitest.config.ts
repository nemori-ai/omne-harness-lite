import { defineConfig } from 'vitest/config'
import { testTiers } from '../../../vitest.tiers.mts'

export default defineConfig(({ mode }) => {
  const tiers = testTiers(mode)
  return {
    test: {
      ...tiers,
      include: ['tests/**/*.spec.ts'],
      // Every case fails on a rejection nobody handled (SPEC P7): see the file for why.
      setupFiles: ['tests/unhandled.ts'],
      typecheck: {
        ...tiers.typecheck,
        enabled: true,
        include: ['tests/**/*.spec-d.ts'],
        tsconfig: './tsconfig.test.json',
      },
    },
  }
})
