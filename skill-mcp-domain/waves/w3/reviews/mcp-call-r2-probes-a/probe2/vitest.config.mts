import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { root: '/tmp/ir-call-r2/probe2', include: ['*.spec.ts'], testTimeout: 20000 } })
