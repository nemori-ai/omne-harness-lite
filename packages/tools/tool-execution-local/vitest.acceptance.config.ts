import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const demoEntry = new URL(
  '../../../examples/model-invocation-minimal-demo/dist/index.js',
  import.meta.url,
)
if (!existsSync(demoEntry))
  throw new Error(
    'Build the demo before acceptance: pnpm --filter @omne-harness-lite/model-invocation-minimal-demo... run build',
  )

export default defineConfig({
  test: {
    root: fileURLToPath(new URL('.', import.meta.url)),
    include: ['acceptance/**/*.acceptance.ts'],
    testTimeout: 180_000,
    hookTimeout: 60_000,
  },
})
