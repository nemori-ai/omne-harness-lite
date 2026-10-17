import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { compareDeclarations, problemsOf, type EqualityReport } from './declaration-equality.ts'
import { loadInventory, namesOf } from './exports-inventory.ts'

// Page and source must declare each landed name identically: the probes in `*.spec-d.ts` use
// assignments, which do not notice an added optional field or a widened union. The inventory says
// what has landed, so a name that a later stage lands is compared without a change here.
const packageDirectory = fileURLToPath(new URL('..', import.meta.url))
const workDirectory = mkdtempSync(join(tmpdir(), 'public-api-types-'))
afterAll(() => rmSync(workDirectory, { recursive: true, force: true }))

const inventory = loadInventory(new URL('./fixtures/exports.json', import.meta.url).pathname)
const landed = namesOf(inventory.entries['.']!).filter(item => !item.pending)

describe('docs/public-api.md against the source entry', () => {
  let report: EqualityReport
  beforeAll(() => {
    report = compareDeclarations({
      page: readFileSync(join(packageDirectory, 'docs/public-api.md'), 'utf8'),
      landed,
      sourceEntry: join(packageDirectory, 'src/index.ts'),
      packageDirectory,
      workDirectory,
    })
  })

  it('declares every landed name identically on the page and in the source', () => {
    expect(problemsOf(report)).toEqual([])
  })

  it('compared every landed name, so that an empty comparison cannot pass', () => {
    expect(landed.length).toBeGreaterThan(0)
    expect([...report.compared, ...report.comparedAsText].sort()).toEqual(
      landed.map(item => item.name).sort(),
    )
  })

  it('compares only the brand declaration as text', () => {
    expect(report.comparedAsText).toEqual(['Identity'])
  })
})
