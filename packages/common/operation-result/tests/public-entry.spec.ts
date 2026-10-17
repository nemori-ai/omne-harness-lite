import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('exports exactly the four operation-result functions from the root', async () => {
  const root = await import('@omne-harness/operation-result')
  expect(Object.keys(root).sort()).toEqual(['ack', 'fail', 'isSuccess', 'succeed'])
})

it('declares no dependencies and generates root files that do not mention cordis', () => {
  const parsed: unknown = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  )
  expect(parsed).toMatchObject({ dependencies: {} })
  expect(Object.keys((parsed as { dependencies: object }).dependencies)).toEqual([])
  expect(Object.keys((parsed as { exports: object }).exports)).toEqual(['.'])

  const indexJs = readFileSync(new URL('../dist/index.js', import.meta.url), 'utf8')
  const indexDts = readFileSync(new URL('../dist/index.d.ts', import.meta.url), 'utf8')
  for (const source of [indexJs, indexDts]) {
    expect(source.includes('@deepseek-ai/cordis')).toBe(false)
  }
})
