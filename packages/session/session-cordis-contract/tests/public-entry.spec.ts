// The root entry re-exports contract types only: no runtime value, and no Cordis in its module
// graph (IC-4, SPEC property 7).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

it('exports no runtime value from the root entry', async () => {
  const root = (await import('@omne-harness/session-cordis-contract')) as Record<string, unknown>
  expect(Object.keys(root)).toEqual([])
})

it('does not import Cordis or a provider from the root source', () => {
  const source = readFileSync(fileURLToPath(new URL('../src/index.ts', import.meta.url)), 'utf8')
  expect(source).not.toMatch(/@deepseek-ai\/cordis/u)
  expect(source).not.toMatch(/@omne-harness\/session(-cordis|-adapters|-storage-sql)?['/]/u)
  expect(source).toMatch(/export type \* from '@omne-harness\/session-contract'/u)
})

it('does not import a provider from the cordis source', () => {
  const source = readFileSync(fileURLToPath(new URL('../src/cordis.ts', import.meta.url)), 'utf8')
  expect(source).not.toMatch(/@omne-harness\/session(-cordis|-adapters|-storage-sql)['/]/u)
})
