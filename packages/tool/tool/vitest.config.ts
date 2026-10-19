import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { testTiers } from '../../../vitest.tiers.mts'

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@omne-harness\/tool-contract$/,
        replacement: fileURLToPath(new URL('../tool-contract/src/index.ts', import.meta.url)),
      },
      {
        find: /^@omne-harness\/tool-contract\/binding$/,
        replacement: fileURLToPath(new URL('../tool-contract/src/binding.ts', import.meta.url)),
      },
      {
        find: /^@omne-harness\/tool-contract\/testing$/,
        replacement: fileURLToPath(new URL('../tool-contract/src/testing.ts', import.meta.url)),
      },
    ],
  },
  test: {
    ...testTiers(),
    include: ['tests/**/*.spec.ts'],
    typecheck: {
      enabled: true,
      include: ['tests/**/*.spec-d.ts'],
      tsconfig: './tsconfig.test.json',
    },
  },
})
