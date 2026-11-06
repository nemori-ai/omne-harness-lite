import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'

it('keeps the root entry free of runtime values', async () => {
  const root: Record<string, unknown> = await import('@omne-harness/skill-cordis-contract')
  expect(Object.keys(root)).toEqual([])
})

it('keeps the root entry source and built file free of Cordis', async () => {
  const source = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8')
  expect(source).not.toContain('@deepseek-ai/cordis')
  const built = await readFile(new URL('../dist/index.js', import.meta.url), 'utf8')
  expect(built).not.toMatch(/\bimport\b/)
})
