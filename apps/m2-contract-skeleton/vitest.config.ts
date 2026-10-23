import { defineConfig } from 'vitest/config'
import { testTiers } from '../../vitest.tiers.mts'

export default defineConfig(({ mode }) => {
  const tiers = testTiers(mode)
  return {
    test: {
      ...tiers,
      include: ['tests/**/*.spec.ts'],
      testTimeout: 15000,
      typecheck: {
        ...tiers.typecheck,
        enabled: true,
        include: ['tests/**/*.spec-d.ts'],
        tsconfig: './tsconfig.test.json',
      },
    },
  }
})
