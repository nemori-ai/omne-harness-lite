import { defineConfig } from '@playwright/test'
import type { Target } from './e2e/desktop.ts'

// The test profile end to end against a real server: unpackaged after `pnpm run build`, packaged
// after `pnpm run package`. The release profile is checked from outside by `pnpm run verify:release`.
export default defineConfig<{ target: Target }>({
  testDir: 'e2e',
  testMatch: '*.spec.ts',
  globalSetup: './e2e/global-setup.ts',
  // One app at a time: each launch is heavy, and two would share one server's state.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env['CI']),
  retries: 0,
  timeout: 120_000,
  reporter: [['list']],
  outputDir: 'test-results',
  use: { trace: 'retain-on-failure' },
  projects: [
    { name: 'unpackaged', use: { target: 'unpackaged' } },
    { name: 'packaged-fuses', testMatch: 'packaged-fuses.setup.ts' },
    { name: 'packaged', use: { target: 'packaged' }, dependencies: ['packaged-fuses'] },
  ],
})
