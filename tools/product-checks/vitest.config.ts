import { defineConfig } from 'vitest/config'
import { testTiers } from '../../vitest.tiers.mts'

const conditions = ['source', 'module', 'node', 'import', 'default']

export default defineConfig(({ mode }) => {
  const tiers = testTiers(mode)
  return {
    resolve: { conditions },
    ssr: { resolve: { conditions, externalConditions: ['source'] } },
    test: {
      ...tiers,
      globalSetup: ['./tests/global-build.ts'],
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
