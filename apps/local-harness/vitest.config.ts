import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { include: ['tests/storage-admission/**/*.spec.ts'] },
})
