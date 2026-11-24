import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { expect, it } from 'vitest'

const src = join(import.meta.dirname, '..', 'src')

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)],
  )
}

/** Every package a source file imports, with the file that imports it. */
const imports = files(src).flatMap(file =>
  [...readFileSync(file, 'utf8').matchAll(/(?:from|import)\s+'([^']+)'/g)]
    .map(match => match[1]!)
    .filter(name => !name.startsWith('.'))
    .map(name => ({ file: relative(src, file), name })),
)

const CONTRACT = '@omne-harness/notification-contract'

it('the definition imports its contract and nothing else: no Cordis, no storage, no other domain', () => {
  const product = imports.filter(({ file }) => !file.startsWith('testing/'))
  expect(product.length).toBeGreaterThan(0)
  expect(product.filter(({ name }) => name !== CONTRACT)).toEqual([])
})

it('the testing entry adds only the assertions of Node', () => {
  const testing = imports.filter(({ file }) => file.startsWith('testing/'))
  expect(testing.filter(({ name }) => name !== CONTRACT && name !== 'node:assert/strict')).toEqual(
    [],
  )
})
