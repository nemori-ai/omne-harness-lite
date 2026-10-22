import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { it, expect } from 'vitest'
it('built entries match the inventory and public-api navigation', () => {
  const root = fileURLToPath(new URL('../../../..', import.meta.url))
  const cli = fileURLToPath(
    new URL('../../../../tools/dev-flow/src/package-exports/cli.ts', import.meta.url),
  )
  const directory = fileURLToPath(new URL('..', import.meta.url))
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', cli, directory, '--json'],
    { cwd: root, encoding: 'utf8' },
  )
  expect(result.status, result.stdout + result.stderr).toBe(0)
})
