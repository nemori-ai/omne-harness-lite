import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export default function setup(): void {
  const root = fileURLToPath(new URL('../../../', import.meta.url))
  execFileSync(
    process.execPath,
    [
      fileURLToPath(new URL('../../../node_modules/turbo/bin/turbo', import.meta.url)),
      'run',
      'build',
      '--filter=@omne-harness/product-checks',
      '--output-logs=errors-only',
    ],
    {
      cwd: root,
      stdio: ['ignore', 'ignore', 'inherit'],
      env: {
        ...process.env,
        TURBO_TELEMETRY_DISABLED: '1',
        TURBO_NO_UPDATE_NOTIFIER: '1',
      },
    },
  )
}
