import { defineConfig } from 'vitest/config'
import { testTiers } from '../../../vitest.tiers.mts'

export default defineConfig({
  test: {
    ...testTiers(),
    include: ['tests/**/*.spec.ts'],
    // 不为每个测试文件重新导入模块：导入占了这个成员快层耗时的大头。2026-10-02 在同一负载下交替实测，
    // 快层墙钟中位数 125 秒 → 36 秒，不隔离连跑 5 次全过，两层一起 2 次全过。代价是同一工作进程里的
    // 测试文件共享模块状态：新测试不能依赖「模块是新加载的」；出现文件之间串状态的失败就先改回隔离再查。
    isolate: false,
    typecheck: {
      enabled: true,
      include: ['tests/**/*.spec-d.ts'],
      tsconfig: './tsconfig.test.json',
    },
  },
})
