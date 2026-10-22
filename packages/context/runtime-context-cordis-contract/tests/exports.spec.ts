import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
it('built root, Cordis entry, external type re-exports and module augmentations match the inventory', () => {
  const directory = fileURLToPath(new URL('../', import.meta.url))
  const cli = fileURLToPath(
    new URL('../../../../tools/dev-flow/src/package-exports/cli.ts', import.meta.url),
  )
  const result = spawnSync(process.execPath, ['--experimental-strip-types', cli, directory], {
    encoding: 'utf8',
  })
  expect(result.status, result.stdout + result.stderr).toBe(0)
})
