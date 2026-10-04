import { defineConfig } from 'vitest/config'
import { testTiers } from '../../../vitest.tiers.mts'

export default defineConfig({
  test: {
    ...testTiers(),
    include: ['tests/**/*.spec.ts'],
    // 共享工作进程内的模块，避免每个文件重复导入分词器与图片预处理器。2026-10-03 同一运行名额下
    // 交替五轮快层：每轮 1328 条全过，墙钟中位数 156.7 → 37.8 秒。测试必须清理自己的 mock，
    // 共用夹具按工作进程存活；出现文件之间串状态的失败时先恢复隔离再排查。
    isolate: false,
    typecheck: {
      enabled: true,
      include: ['tests/**/*.spec-d.ts'],
      tsconfig: './tsconfig.test.json',
    },
  },
})
