import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { root: '/tmp/r4a/probe2', include: ['*.spec.ts'], testTimeout: 120000 } })
