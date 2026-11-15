import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const tool = (name: string) =>
  import(new URL(`../../../../tools/dev-flow/src/package-exports/${name}.ts`, import.meta.url).href)

it('built public entries, inventory and source navigation agree', async () => {
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
