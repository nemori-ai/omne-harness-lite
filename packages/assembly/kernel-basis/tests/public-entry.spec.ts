import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('exports operation results from the root and does not export cordis helpers', async () => {
  const root = await import('@omne-harness/kernel-basis')
  expect(typeof root.succeed).toBe('function')
  expect(typeof root.ack).toBe('function')
  expect(typeof root.fail).toBe('function')
  expect(typeof root.isSuccess).toBe('function')
  expect('definePlugin' in root).toBe(false)
  expect('resolveOptional' in root).toBe(false)
  expect('startTestAssembly' in root).toBe(false)

  const parsed: unknown = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  expect(parsed).toMatchObject({
    dependencies: { '@deepseek-ai/cordis': 'catalog:' },
    engines: { node: '>=24.18.0 <25' },
  })

  const indexJs = readFileSync(new URL('../dist/index.js', import.meta.url), 'utf8')
  const indexDts = readFileSync(new URL('../dist/index.d.ts', import.meta.url), 'utf8')
  for (const source of [indexJs, indexDts]) {
    expect(source.includes('@deepseek-ai/cordis')).toBe(false)
    expect(source.includes('definePlugin')).toBe(false)
    expect(source.includes('resolveOptional')).toBe(false)
  }
})
