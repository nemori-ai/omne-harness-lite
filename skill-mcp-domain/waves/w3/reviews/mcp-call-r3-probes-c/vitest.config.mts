import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { root: '/tmp/call-c3-probe', include: ['*.spec.ts'], testTimeout: 60000 } })
