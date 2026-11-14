/**
 * @module-tag slow
 */
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const project = fileURLToPath(new URL('./fixtures/browser/tsconfig.json', import.meta.url))
const source = fileURLToPath(new URL('../src/', import.meta.url))
const tsc = join(
  dirname(createRequire(import.meta.url).resolve('typescript/package.json')),
  'lib',
  'tsc.js',
)

it('compiles the root entry for a browser consumer without Node types', () => {
  const result = spawnSync(process.execPath, [tsc, '-p', project], {
    encoding: 'utf8',
    timeout: 90_000,
  })
  expect(result.error).toBeUndefined()
  expect(`${result.stdout}${result.stderr}`).toBe('')
  expect(result.status).toBe(0)
})

it('imports only the shared contract and its own files', () => {
  const imports = readdirSync(source)
    .filter(file => file.endsWith('.ts'))
    .flatMap(file =>
      [...readFileSync(join(source, file), 'utf8').matchAll(/from '([^']+)'/g)].map(m => m[1]),
    )
  expect(new Set(imports.filter(spec => !spec?.startsWith('./')))).toEqual(
    new Set(['@omne-harness/public-contract']),
  )
})
