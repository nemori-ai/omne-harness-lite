import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  builtDeclarations,
  chapterProblems,
  compareAugmentations,
  compareEntries,
  isClean,
  loadInventory,
  namesOf,
  publicApiChapters,
  sameAsProblems,
} from './exports-inventory.ts'

const packageDirectory = fileURLToPath(new URL('..', import.meta.url))
const inventory = loadInventory(new URL('./fixtures/exports.json', import.meta.url).pathname)
const declarations = builtDeclarations(packageDirectory, inventory)
const comparisons = compareEntries(inventory, declarations)

describe('built entries against the export inventory', () => {
  it('inventories every package.json export subpath and no other', () => {
    const manifest = JSON.parse(readFileSync(`${packageDirectory}package.json`, 'utf8')) as {
      exports: Record<string, unknown>
    }
    expect(Object.keys(inventory.entries).sort()).toEqual(Object.keys(manifest.exports).sort())
  })

  it('has no empty chapter and no repeated name inside an entry', () => {
    for (const [entry, value] of Object.entries(inventory.entries)) {
      for (const chapter of value.chapters)
        expect(chapter.names, `${entry} ${chapter.title}`).not.toEqual([])
      const names = namesOf(value).map(item => item.name)
      expect(names.length, entry).toBe(new Set(names).size)
    }
  })

  for (const comparison of comparisons) {
    it(`entry ${comparison.entry} publishes exactly the inventory`, () => {
      console.info(
        `[exports] ${inventory.package} ${comparison.entry}: ${comparison.total} listed, ` +
          `${comparison.pending} pending, ${comparison.total - comparison.pending} landed`,
      )
      expect(isClean(comparison), JSON.stringify(comparison, null, 2)).toBe(true)
    })
  }

  it('lists every chapter and exported name of docs/public-api.md', () => {
    const page = readFileSync(`${packageDirectory}docs/public-api.md`, 'utf8')
    expect(chapterProblems(inventory, publicApiChapters(page))).toEqual([])
  })

  it('lists every re-exported name in the entry that owns it, with the same kind', () => {
    expect(sameAsProblems(inventory)).toEqual([])
  })

  it('states the expected number of pending names', () => {
    const pending = comparisons.reduce((sum, comparison) => sum + comparison.pending, 0)
    expect(pending).toBe(inventory.expectedPending)
  })

  it('builds the inventoried module augmentations', () => {
    expect(compareAugmentations(inventory, declarations)).toEqual([])
  })
})
