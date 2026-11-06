import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { root: '/tmp/ir-call-r3/r2probes', include: ['*.spec.ts'], testTimeout: 60000 } })
