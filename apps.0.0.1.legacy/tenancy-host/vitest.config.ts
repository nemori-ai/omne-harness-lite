import { defineConfig } from 'vitest/config'
import { testTiers } from '../../vitest.tiers.mts'

export default defineConfig({
  test: {
    ...testTiers(),
    include: ['tests/**/*.spec.ts'],
    // 钩子里要停真宿主、关真库、杀子进程，还没有钩子耗时的读数，钩子上界照旧放宽；用例的时限归分层（仓库根 vitest.tiers.mts）
    hookTimeout: 60_000,
    typecheck: {
      enabled: true,
      include: ['tests/**/*.spec-d.ts'],
      tsconfig: './tsconfig.test.json',
    },
  },
})
