// The `SkillAccess` conformance suite of `skill-contract/testing` runs on `createSkillAccess`
// over the memory doubles, each case on a fresh fixture. A not-applicable case counts as a
// failure here: the fixture must offer everything. The same suite runs in process on a service
// whose read check grants everyone, and fails exactly on the non-disclosure cases.
import { AssertionError } from 'node:assert/strict'
import { describe, expect, it } from 'vitest'
import { createSkillAccess } from '@omne-harness/skill'
import {
  runConformanceCase,
  skillAccessConformance,
  type AccessFixture,
  type ConformanceCase,
} from '@omne-harness/skill-contract/testing'
import { accessFixture, type Principal, type Scope } from './access-world.ts'

const cases = skillAccessConformance<Principal, Scope>()

describe('SkillAccess conformance: createSkillAccess over the memory doubles', () => {
  it('has at least 13 cases over the clauses A1 to A13', () => {
    expect(cases.length).toBeGreaterThanOrEqual(13)
    const clauses = new Set(cases.map(item => item.clause))
    for (let index = 1; index <= 13; index += 1) expect(clauses).toContain(`A${index}`)
  })

  for (const conformance of cases)
    it(`${conformance.clause} ${conformance.name}`, async () => {
      expect(await runConformanceCase(conformance, accessFixture())).toEqual({ kind: 'passed' })
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
  it('fails exactly the non-disclosure cases A1 to A3', async () => {
    const granting = (): AccessFixture<Principal, Scope> => {
      const fixture = accessFixture()
      const access = createSkillAccess({
        ...fixture.ports,
        readCheck: { check: async () => ({ kind: 'granted' }) },
      })
      return { ...fixture, access }
    }
    expect(await failing(granting)).toEqual(['A1', 'A2', 'A3'])
  })

  it('passes every case on the real service, so the failures above come from the skipped check', async () => {
    expect(await failing(accessFixture)).toEqual([])
  })
})

/** Keeps the case type in use for the registration above. */
export type Registered = ConformanceCase<AccessFixture<Principal, Scope>>
