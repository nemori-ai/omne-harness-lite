// @module-tag slow
// Runs a child process with macOS network denial and real SQLite.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

it('installs fixed seeds through real SQL with macOS network denial', context => {
  if (process.platform !== 'darwin') context.skip('OS network denial requires macOS sandbox-exec')
  const script = fileURLToPath(new URL('./integration.mjs', import.meta.url))
  const output = execFileSync(
    '/usr/bin/sandbox-exec',
    ['-p', '(version 1) (allow default) (deny network*)', process.execPath, script],
    { encoding: 'utf8', timeout: 60_000 },
  )
  expect(output).toContain('"unchanged":true')
  expect(output).toContain('"network":"OS sandbox denied"')
}, 65_000)
