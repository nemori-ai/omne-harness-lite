import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
it('root emits no runtime export and has only explicit contract type re-exports', async () => {
  expect(Object.keys(await import('@omne-harness/runtime-context-cordis-contract'))).toEqual([])
  const text = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
  expect(text).not.toContain('@deepseek-ai/cordis')
  expect(text).not.toMatch(/export\s+type\s+\*/)
})
it('source, declarations and runtime binding depend only on the public contract and Cordis', () => {
  for (const path of ['../src/cordis.ts', '../dist/cordis.d.ts', '../dist/cordis.js']) {
    const text = readFileSync(new URL(path, import.meta.url), 'utf8')
    expect(text).not.toMatch(/['"]@omne-harness\/runtime-context(?:-cordis)?['"]/)
  }
})
