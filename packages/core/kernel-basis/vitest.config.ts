import { defineConfig } from 'vitest/config'
import { testTiers } from '../../../vitest.tiers.mts'

export default defineConfig({
  test: {
    ...testTiers(),
    // tests/basis/*.test.ts 是 basis 条目登记的 probe，路径被 basis front-matter 引用，不要改名。
    include: ['tests/**/*.spec.ts', 'tests/basis/*.test.ts'],
    typecheck: {
      enabled: true,
      include: ['tests/**/*.spec-d.ts'],
      tsconfig: './tsconfig.test.json',
    },
  },
})
