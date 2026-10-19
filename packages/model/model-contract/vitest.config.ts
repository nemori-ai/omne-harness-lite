import { configDefaults, defineConfig } from 'vitest/config'
import { testTiers } from '../../../vitest.tiers.mts'

export default defineConfig({
  test: {
    ...testTiers(),
    include: ['tests/**/*.spec.ts'],
    exclude: [...configDefaults.exclude, 'tests/fixtures/consumers/**'],
    typecheck: {
      enabled: true,
      include: ['tests/**/*.spec-d.ts'],
      tsconfig: './tsconfig.test.json',
    },
  },
})
