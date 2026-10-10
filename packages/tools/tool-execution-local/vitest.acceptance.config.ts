import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const demoEntry = new URL(
  '../../../examples/model-invocation-minimal-demo/dist/index.js',
  import.meta.url,
)
if (!existsSync(demoEntry))
  throw new Error(
    'Unable to verify PF-006 S24/S69: the demo was physically removed; migrate the preserved acceptance assertions to the formal CLI entry before delivery.',
  )

export default defineConfig({
  test: {
    root: fileURLToPath(new URL('.', import.meta.url)),
    include: ['acceptance/**/*.acceptance.ts'],
    testTimeout: 180_000,
    hookTimeout: 60_000,
  },
})
