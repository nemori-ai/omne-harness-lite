import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

it('installs fixed seeds through the real SQL combination with OS network denial', () => {
  const script = fileURLToPath(new URL('./integration.mjs', import.meta.url))
  const output = execFileSync(
    '/usr/bin/sandbox-exec',
    ['-p', '(version 1) (allow default) (deny network*)', process.execPath, script],
    { encoding: 'utf8', timeout: 60_000 },
  )
  expect(output).toContain('"unchanged":true')
  expect(output).toContain('"network":"OS sandbox denied"')
}, 65_000)
