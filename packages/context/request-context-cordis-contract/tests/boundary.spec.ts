import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const tool = (name: string) =>
  import(new URL(`../../../../tools/dev-flow/src/package-exports/${name}.ts`, import.meta.url).href)

it('definition and built entries do not import production implementation members', () => {
  for (const path of [
    'src/index.ts',
    'src/cordis.ts',
    'dist/index.js',
    'dist/index.d.ts',
    'dist/cordis.js',
    'dist/cordis.d.ts',
  ]) {
    const text = readFileSync(new URL('../' + path, import.meta.url), 'utf8')
    expect(text).not.toMatch(
      /from ['"]@omne-harness\/(?:request-context|request-context-cordis)['"]/,
    )
  }
  expect(readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')).not.toContain(
    '@deepseek-ai/cordis',
  )
})
it('shared export inventory agrees with source, declarations and public navigation', async () => {
  const directory = fileURLToPath(new URL('..', import.meta.url))
  const { decodeInventory, inventoryProblems } = await tool('inventory')
  const { manifestDeclarations, compareEntries, comparisonProblems, compareAugmentations } =
    await tool('declarations')
  const decoded = decodeInventory(
    JSON.parse(readFileSync(new URL('fixtures/exports.json', import.meta.url), 'utf8')),
  )
  expect(decoded.kind, JSON.stringify(decoded)).toBe('inventory')
  const manifest = manifestDeclarations(directory)
  const declarations = Object.fromEntries(
    Object.keys(decoded.inventory.entries).flatMap(entry => {
      const path = manifest.declarations[entry]
      return path !== undefined && existsSync(path) ? [[entry, path]] : []
    }),
  )
  const scoped = {
    ...decoded.inventory,
    entries: Object.fromEntries(
      Object.entries(decoded.inventory.entries).filter(([entry]) => entry in declarations),
    ),
  }
  expect([
    ...inventoryProblems(decoded.inventory, manifest.entries),
    ...Object.keys(decoded.inventory.entries)
      .filter(entry => !(entry in declarations))
      .map(entry => `${entry}: no built declaration`),
    ...compareEntries(scoped, declarations).flatMap(comparisonProblems),
    ...compareAugmentations(scoped, declarations, directory),
  ]).toEqual([])
})
