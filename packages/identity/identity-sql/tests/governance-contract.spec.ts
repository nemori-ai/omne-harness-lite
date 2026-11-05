// @module-tag slow
// AC-1 (identity spec, second half): the identity governance contract suite on the persistent
// provider over the real SQLite provider. Slow: every case opens a new storage deployment with its
// Worker threads, and the restart cases close it and open the same files again. The fixture injects
// the suite's record store faults and restarts, so no case is not applicable. The configurations
// are those of the reference double's test file (packages/identity/identity/tests/
// governance-contract.spec.ts).
import { afterAll, describe, expect, it } from 'vitest'
import {
  IDENTITY_GOVERNANCE_CONTRACT_CASES,
  checkIdentityGovernanceContract,
  type IdentityGovernanceContractOptions,
} from '@omne-harness/identity/testing'
import { governanceFixture } from './fixtures/governance.ts'
import { duration, instant } from './fixtures/provider.ts'

const CONFIGURATIONS: readonly (readonly [string, IdentityGovernanceContractOptions])[] = [
  [
    'one minute and one day',
    {
      start: instant('2026-10-25T23:59:30Z'),
      short: duration('PT60S'),
      long: duration('PT86400S'),
    },
  ],
  [
    'fractional lifetimes',
    {
      start: instant('2026-12-31T23:59:50.25Z'),
      short: duration('PT0.5S'),
      long: duration('PT0.625S'),
    },
  ],
]

const fixtures = CONFIGURATIONS.map(() => governanceFixture())

afterAll(async () => {
  for (const entry of fixtures) await entry.close()
}, 120_000)

describe('the identity governance contract suite on the SQL provider', () => {
  it.each(CONFIGURATIONS.map((entry, index) => [...entry, index] as const))(
    'passes every case with %s',
    { tags: ['slow'], timeout: 300_000 },
    async (_name, options, index) => {
      const fixture = fixtures[index]
      if (fixture === undefined) throw new Error('fixture missing')
      const report = await checkIdentityGovernanceContract(fixture.fixture, options)
      expect(report.cases.filter(result => result.status !== 'passed')).toEqual([])
      expect(report.passed).toBe(true)
      expect(report.cases.map(result => result.id)).toEqual(
        IDENTITY_GOVERNANCE_CONTRACT_CASES.map(contractCase => contractCase.id),
      )
    },
  )
})
