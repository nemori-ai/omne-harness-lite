import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('exports no runtime value from the root, so no predicate or constructor leaks in', async () => {
  const root = (await import('@omne-harness/exchange-refs')) as Record<string, unknown>
  expect(Object.keys(root)).toEqual([])
})

it('declares no dependencies and only the root entry', () => {
  const parsed = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    dependencies: Record<string, string>
    exports: Record<string, unknown>
  }
  expect(Object.keys(parsed.dependencies)).toEqual([])
  expect(Object.keys(parsed.exports)).toEqual(['.'])
})
