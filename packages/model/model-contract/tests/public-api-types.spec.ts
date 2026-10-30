import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  loadInventory,
  navigationProblems,
  namesOf,
  publicApiChapters,
} from './exports-inventory.ts'

// `docs/public-api.md` does not repeat declarations. Each chapter says who uses the names and links
// the source files that declare them. The inventory is the list of names. This check ties the two
// together, so that a name the page forgets, a link to the wrong file and a renamed file turn red.
// The shapes of the declarations are checked by the probes in `*.spec-d.ts`, which the chapters link.
const packageDirectory = fileURLToPath(new URL('..', import.meta.url))
const inventory = loadInventory(fileURLToPath(new URL('./fixtures/exports.json', import.meta.url)))
const chapters = publicApiChapters(
  readFileSync(join(packageDirectory, 'docs/public-api.md'), 'utf8'),
)

describe('docs/public-api.md as the navigation to the source', () => {
  it('links, for every inventoried chapter, existing source files that declare its names', () => {
    expect(
      navigationProblems(inventory, chapters, packageDirectory, join(packageDirectory, 'docs')),
    ).toEqual([])
  })

  it('checks every inventoried name, so that an empty inventory cannot pass', () => {
    for (const [entry, value] of Object.entries(inventory.entries))
      expect(namesOf(value).length, entry).toBeGreaterThan(0)
    const titles = new Set(
      Object.values(inventory.entries).flatMap(value => value.chapters.map(item => item.title)),
    )
    expect(titles.size).toBeGreaterThan(0)
    for (const title of titles) expect(chapters.has(title), title).toBe(true)
  })
})
