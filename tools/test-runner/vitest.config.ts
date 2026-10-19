import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { testTiers } from '../../vitest.tiers.mts'

export default defineConfig(({ mode }) => {
  const tiers = testTiers(mode)
  return {
    test: {
      ...tiers,
      provide: {
        pythonToolingRoot:
          process.env['OMNE_RUNNER_ROOT'] ?? fileURLToPath(new URL('../../', import.meta.url)),
      },
      setupFiles: ['./tests/setup-environment.ts'],
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
