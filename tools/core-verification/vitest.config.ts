import { defineConfig } from 'vitest/config'
import { testTiers } from '../../vitest.tiers.mts'

export default defineConfig({
  test: {
    ...testTiers(),
    include: ['tests/legacy-suite-exit.spec.ts'],
  },
})
