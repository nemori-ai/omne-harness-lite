import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
it('built exports, inventory and public API sources agree', () => {
  const tool = fileURLToPath(
    new URL('../../../../tools/dev-flow/src/package-exports/cli.ts', import.meta.url),
  )
  const member = fileURLToPath(new URL('..', import.meta.url))
  expect(() =>
    execFileSync(process.execPath, ['--experimental-strip-types', tool, member, '--json'], {
      encoding: 'utf8',
    }),
  ).not.toThrow()
})
