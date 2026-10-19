import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('exports exactly the six functions and the frozen modality list at runtime', async () => {
  const root = (await import('@omne-harness/modality')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'MODALITIES',
    'isCanonicalMediaType',
    'judgeMediaType',
    'judgeModalities',
    'judgeModality',
    'missingModalities',
  ])
})

it('declares no dependency and only the root entry', () => {
  const manifest: unknown = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  )
  expect(manifest).toMatchObject({ dependencies: {} })
  expect(Object.keys((manifest as { exports: Record<string, unknown> }).exports)).toEqual(['.'])
})

it('builds artifacts that import nothing', () => {
  const js = readFileSync(new URL('../dist/index.js', import.meta.url), 'utf8')
  const declaration = readFileSync(new URL('../dist/index.d.ts', import.meta.url), 'utf8')
  expect(js).not.toMatch(/^\s*import\s/m)
  expect(declaration).not.toMatch(/^\s*import\s/m)
})
