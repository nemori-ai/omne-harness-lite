import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

it('rejects substituted permission capture bindings and preserves source failures', async () => {
  const script = fileURLToPath(new URL('./permission-capture-boundaries.mjs', import.meta.url))
  const root = fileURLToPath(new URL('../../../../../', import.meta.url))
  const { stdout } = await promisify(execFile)(
    process.execPath,
    ['--experimental-strip-types', script],
    {
      cwd: root,
      timeout: 20_000,
    },
  )
  const result = JSON.parse(stdout) as { checks: number; passed: string[] }
  expect(result.checks).toBe(result.passed.length)
  expect(result.passed).toContain('mapping rejects a different tenant scope')
  expect(result.passed).toContain('mapped material reads a present tenant prohibition')
  expect(result.passed).toContain(
    'unmapped material retains Session and Agent missing-basis requirements',
  )
})
