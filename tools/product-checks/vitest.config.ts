import { defineConfig } from 'vitest/config'
import { testTiers } from '../../vitest.tiers.mts'

// 工作区依赖（legal-identity）按 `source` 条件读源码，单独运行测试不必先构建它；
// 构建产物的 CLI 一致性用例仍对着本成员的 dist。
const conditions = ['source', 'module', 'node', 'import', 'default']

export default defineConfig({
  resolve: { conditions },
  ssr: { resolve: { conditions, externalConditions: ['source'] } },
  test: {
    ...testTiers(),
    globalSetup: ['./tests/global-build.ts'],
    setupFiles: ['./tests/setup-environment.ts'],
    include: ['tests/**/*.spec.ts'],
    typecheck: {
      enabled: true,
      include: ['tests/**/*.spec-d.ts'],
      tsconfig: './tsconfig.test.json',
    },
  },
})
