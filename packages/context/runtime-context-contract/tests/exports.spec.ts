import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { it, expect } from 'vitest'
it('built public entries, inventory and source navigation agree', () => {
  const packageDir = fileURLToPath(new URL('../', import.meta.url))
  const cli = fileURLToPath(
    new URL('../../../../tools/dev-flow/src/package-exports/cli.ts', import.meta.url),
  )
  const result = spawnSync(process.execPath, ['--experimental-strip-types', cli, packageDir], {
    encoding: 'utf8',
  })
  expect(result.status, result.stdout + result.stderr).toBe(0)
})
