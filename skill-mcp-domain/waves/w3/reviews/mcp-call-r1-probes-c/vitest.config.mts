import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: { root: '/tmp/call-c-probe', include: ['*.spec.ts'] },
})
