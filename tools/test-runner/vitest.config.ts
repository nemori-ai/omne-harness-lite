import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { testTiers } from '../../vitest.tiers.mts'

export default defineConfig({
  test: {
    ...testTiers(),
    provide: {
      pythonToolingRoot:
        process.env['OMNE_RUNNER_ROOT'] ?? fileURLToPath(new URL('../../', import.meta.url)),
    },
    setupFiles: ['./tests/setup-environment.ts'],
    include: ['tests/**/*.spec.ts'],
    typecheck: {
      enabled: true,
      include: ['tests/**/*.spec-d.ts'],
      tsconfig: './tsconfig.test.json',
    },
  },
})
