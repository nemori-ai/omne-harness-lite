import { expect, it } from 'vitest'

it('keeps the root entry free of runtime values', async () => {
  const root: Record<string, unknown> =
    await import('@omne-harness/execution-environment-cordis-contract')
  expect(Object.keys(root)).toEqual([])
})

it('keeps source and built entry imports inside the definition boundary', async () => {
  const { readFile } = await import('node:fs/promises')
  for (const name of ['index.ts', 'cordis.ts']) {
    const source = await readFile(new URL('../src/' + name, import.meta.url), 'utf8')
    expect(source).not.toMatch(/['"]@omne-harness\/execution-environment(?:-host-local)?['"]/)
    if (name === 'index.ts') expect(source).not.toContain('@deepseek-ai/cordis')
  }
  const built = await readFile(new URL('../dist/index.js', import.meta.url), 'utf8')
  expect(built).not.toMatch(/\bimport\b/)
})
