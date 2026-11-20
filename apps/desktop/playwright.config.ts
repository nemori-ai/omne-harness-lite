import { defineConfig } from '@playwright/test'
import type { Target } from './e2e/desktop.ts'

// The desktop app end to end, through Playwright's Electron driver against a real server. Two
// targets: `unpackaged` after `pnpm run build`, `packaged` after `pnpm run package` as well.
export default defineConfig<{ target: Target }>({
  testDir: 'e2e',
  testMatch: '*.spec.ts',
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
    { name: 'packaged', use: { target: 'packaged' } },
  ],
})
