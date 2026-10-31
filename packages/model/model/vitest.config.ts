import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { testTiers } from '../../../vitest.tiers.mts'

export default defineConfig(({ mode }) => {
  const tiers = testTiers(mode)
  return {
    resolve: {
      alias: [
        {
          find: /^@omne-harness\/model-contract$/,
          replacement: fileURLToPath(
            new URL('../../../packages/model/model-contract/src/index.ts', import.meta.url),
          ),
        },
        {
          find: /^@omne-harness\/model-contract\/provider$/,
          replacement: fileURLToPath(
            new URL(
              '../../../packages/model/model-contract/src/provider/index.ts',
              import.meta.url,
            ),
          ),
        },
        {
          find: /^@omne-harness\/model-contract\/testing$/,
          replacement: fileURLToPath(
            new URL('../../../packages/model/model-contract/src/testing/index.ts', import.meta.url),
          ),
        },
      ],
    },
    test: {
      ...tiers,
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
