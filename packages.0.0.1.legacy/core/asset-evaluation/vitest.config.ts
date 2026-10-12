import { defineConfig } from 'vitest/config'
import { testTiers } from '../../../vitest.tiers.mts'

export default defineConfig({
  test: {
    ...testTiers(),
    include: ['tests/**/*.spec.ts'],
    // Actual Schema compilation is exercised rather than replaced; a single worker
    // makes the runner budget independent of simultaneous package validation jobs.
    maxWorkers: 1,
    typecheck: {
      enabled: true,
      include: ['tests/**/*.spec-d.ts'],
      tsconfig: './tsconfig.test.json',
    },
  },
})
