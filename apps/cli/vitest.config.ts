import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
    // 装配级测试起真库、真 TLS、真子进程；单条上界放宽，慢的几条自己再给上界
    testTimeout: 60_000,
    hookTimeout: 60_000,
    typecheck: {
      enabled: true,
      include: ['tests/**/*.spec-d.ts'],
      tsconfig: './tsconfig.test.json',
    },
  },
})
