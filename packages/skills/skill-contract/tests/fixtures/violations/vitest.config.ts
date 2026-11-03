// Runs only the violating variants. `conformance-red.spec.ts` starts this run in a child process and
// expects the non-disclosure cases to fail and every other case to pass.
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    root: fileURLToPath(new URL('../../..', import.meta.url)),
    include: ['tests/fixtures/violations/*.violation.ts'],
    typecheck: { enabled: false },
  },
})
