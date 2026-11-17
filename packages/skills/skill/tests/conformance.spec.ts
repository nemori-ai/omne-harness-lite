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
  it('has one case for each of the clauses A1 to A12 and A14', () => {
    expect(cases.map(item => item.clause)).toStrictEqual([
      'A1',
      'A2',
      'A3',
      'A4',
      'A5',
      'A6',
      'A7',
      'A8',
      'A9',
      'A10',
      'A11',
      'A12',
      'A14',
    ])
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
