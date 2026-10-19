// @module-tag slow
// Slow because it reads the built `dist` declarations: it needs a finished build, and the fast
// tier runs where `dist` may be absent or being rebuilt.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { leaksOfEntry, localNamesInPublishedSignatures } from './declaration-leaks.ts'

const packageDirectory = fileURLToPath(new URL('..', import.meta.url))
const manifest = JSON.parse(readFileSync(`${packageDirectory}package.json`, 'utf8')) as {
  exports: Record<string, { types: string }>
}

it('finds a local alias that a published interface uses in a signature', () => {
  const text = [
    `type Local = 'a' | 'b';`,
    `export interface Controller { move(input: Readonly<{ kind: Local }>): void }`,
    `export {};`,
  ].join('\n')
  expect(localNamesInPublishedSignatures('leak.d.ts', text, ['Controller'])).toEqual(['Local'])
})

it('does not report a local alias that only an unpublished declaration uses', () => {
  const text = [
    `type Local = 'a';`,
    `export interface Inner { value: Local }`,
    `export type Open = 'b';`,
  ].join('\n')
  expect(localNamesInPublishedSignatures('inner.d.ts', text, ['Open'])).toEqual([])
  expect(localNamesInPublishedSignatures('inner.d.ts', text, 'all')).toEqual(['Local'])
})

it('does not report an alias that the file exports', () => {
  const text = [`export type Named = 'a';`, `export interface Holder { value: Named }`].join('\n')
  expect(localNamesInPublishedSignatures('named.d.ts', text, 'all')).toEqual([])
})

it('the built entries publish no declaration that uses a local type name of its file', () => {
  const leaks = Object.entries(manifest.exports).flatMap(([entry, target]) =>
    leaksOfEntry(`${packageDirectory}${target.types.replace(/^\.\//, '')}`).map(
      leak => `${entry}: ${leak.file.slice(packageDirectory.length)}: ${leak.name}`,
    ),
  )
  expect(leaks).toEqual([])
})
