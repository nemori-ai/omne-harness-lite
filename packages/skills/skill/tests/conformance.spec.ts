// The `SkillAccess` conformance suite of `skill-contract/testing` runs on `createSkillAccess`
// over the memory doubles, each case on a fresh fixture, on two worlds: one whose resolution
// hides every identity from the stranger (as a real port must, PR5), and one whose resolution
// answers everyone so that the read check is the only guard. A not-applicable case counts as a
// failure here: the fixture offers everything. On the second world the same suite runs in
// process on a service whose read check grants everyone, and fails exactly on the
// non-disclosure cases.
import { AssertionError } from 'node:assert/strict'
import { describe, expect, it } from 'vitest'
import { createSkillAccess } from '@omne-harness/skill'
import {
  runConformanceCase,
  skillAccessConformance,
  type AccessFixture,
} from '@omne-harness/skill-contract/testing'
import { accessFixture, type Principal, type Scope } from './access-world.ts'

const cases = skillAccessConformance<Principal, Scope>()

const WORLDS = [
  ['a resolution that hides identities from the stranger', { hiding: true }],
  ['a resolution that answers everyone', { hiding: false }],
] as const

describe('the suite', () => {
  it('has at least 14 cases over the clauses A1 to A14, A12 split in A12a and A12b', () => {
    expect(cases.length).toBeGreaterThanOrEqual(14)
    const clauses = new Set(cases.map(item => item.clause))
    for (let index = 1; index <= 14; index += 1)
      if (index !== 12) expect(clauses).toContain(`A${index}`)
    expect(clauses).toContain('A12a')
    expect(clauses).toContain('A12b')
    expect(clauses).not.toContain('A12')
  })
})

for (const [name, options] of WORLDS)
  describe(`SkillAccess conformance: createSkillAccess over ${name}`, () => {
    for (const conformance of cases)
      it(`${conformance.clause} ${conformance.name}`, async () => {
        expect(await runConformanceCase(conformance, accessFixture(options))).toStrictEqual({
          kind: 'passed',
        })
      })
  })

/** The clauses of the cases that fail by an assertion. Any other error is thrown. */
async function failing(fixture: () => AccessFixture<Principal, Scope>): Promise<string[]> {
  const failed: string[] = []
  for (const conformance of cases)
    try {
      await conformance.run(fixture())
    } catch (error) {
      if (!(error instanceof AssertionError)) throw error
      failed.push(conformance.clause)
    }
  return [...new Set(failed)]
}

describe('the suite goes red on a service that skips the read check', () => {
  it('fails exactly the non-disclosure cases A1 to A3 on the world that answers everyone', async () => {
    const granting = (): AccessFixture<Principal, Scope> => {
      const fixture = accessFixture({ hiding: false })
      const access = createSkillAccess({
        ...fixture.ports,
        readCheck: { check: async () => ({ kind: 'granted' }) },
      })
      return { ...fixture, access }
    }
    expect(await failing(granting)).toStrictEqual(['A1', 'A2', 'A3'])
  })

  it('passes every case on the real service, so the failures above come from the skipped check', async () => {
    expect(await failing(() => accessFixture({ hiding: false }))).toStrictEqual([])
    expect(await failing(() => accessFixture({ hiding: true }))).toStrictEqual([])
  })
})
