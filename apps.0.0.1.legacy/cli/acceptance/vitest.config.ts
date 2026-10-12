import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// 可执行验收单独一份配置：它驱动构建出来的 dist/，不在成员的 test 脚本范围内。
// 先 `pnpm run build`，再 `pnpm run acceptance`。
export default defineConfig({
  test: {
    root: fileURLToPath(new URL('..', import.meta.url)),
    include: ['acceptance/**/*.acceptance.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
})
