import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('has no runtime exports at the root and keeps cordis helpers on their own entries', async () => {
  const root = await import('@omne-harness/kernel-basis')
  expect(Object.keys(root)).toEqual([])

  const parsed: unknown = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  )
  expect(parsed).toMatchObject({
    dependencies: {
      '@deepseek-ai/cordis': 'catalog:',
      '@omne-harness/operation-result': 'workspace:*',
    },
    engines: { node: '>=24' },
  })

  const indexJs = readFileSync(new URL('../dist/index.js', import.meta.url), 'utf8')
  const indexDts = readFileSync(new URL('../dist/index.d.ts', import.meta.url), 'utf8')
  for (const source of [indexJs, indexDts]) {
    expect(source.includes('@deepseek-ai/cordis')).toBe(false)
    expect(source.includes('definePlugin')).toBe(false)
    expect(source.includes('resolveOptional')).toBe(false)
    expect(source.includes('registerInCallerFiber')).toBe(false)
    expect(source.includes('Admission')).toBe(false)
    expect(source.includes('operation-result')).toBe(false)
  }
})
