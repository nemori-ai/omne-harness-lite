// The shape of the `SkillCatalog` conformance suite: at least twelve cases, every clause `SC2` to
// `SC7` of the SPEC conformance suite (`SPEC.md#conformance`) named by a case, and the two
// non-disclosure cases present. The suite runs on an implementation in `@omne-harness/skill`; this member has none.
import { expect, it } from 'vitest'
import { skillCatalogConformance } from '@omne-harness/skill-contract/testing'

const cases = skillCatalogConformance<string, string>()

it('has at least twelve cases', () => {
  expect(cases.length).toBeGreaterThanOrEqual(12)
})

it('names every decided item 2 to 7 by a clause', () => {
  const clauses = new Set(cases.map(item => item.clause))
  for (const item of [2, 3, 4, 5, 6, 7]) expect(clauses).toContain(`SC${item}`)
  for (const clause of clauses) expect(clause).toMatch(/^SC[2-7]$/)
})

it('has the two non-disclosure cases under SC7', () => {
  const names = cases.filter(item => item.clause === 'SC7').map(item => item.name)
  expect(names).toEqual([
    'answers the same whether a refused identity is in the lawful set or does not exist',
    'answers a filter naming a refused identity like one naming a missing identity',
  ])
})

it('gives each case a distinct name', () => {
  const names = cases.map(item => item.name)
  expect(new Set(names).size).toBe(names.length)
})
