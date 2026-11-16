/**
 * @module-tag slow
 */
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const project = fileURLToPath(new URL('./fixtures/browser/tsconfig.json', import.meta.url))
const tsc = join(
  dirname(createRequire(import.meta.url).resolve('typescript/package.json')),
  'lib',
  'tsc.js',
)

it('compiles the client core for a browser consumer without Node types', () => {
  const result = spawnSync(process.execPath, [tsc, '-p', project], {
    encoding: 'utf8',
    timeout: 90_000,
  })
  expect(result.error).toBeUndefined()
  expect(`${result.stdout}${result.stderr}`).toBe('')
  expect(result.status).toBe(0)
})
