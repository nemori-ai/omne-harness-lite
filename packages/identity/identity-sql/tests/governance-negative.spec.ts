// @module-tag slow
// Negative controls of the governance suite on the SQL provider: take one check out of a copy of
// this package's `dist` and show that the contract cases written for that check turn red. Slow: each
// control runs the whole suite on new storage deployments. The unchanged copy passes, so a red case
// comes from the mutation, not from the copy. With IDENTITY_SQL_EVIDENCE_DIR set, each control also
// writes the ids of its failed cases there.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkIdentityGovernanceContract } from '@omne-harness/identity/testing'
import { governanceFixture } from './fixtures/governance.ts'
import { CHECKS, mutantBuild, type CheckName, type Mutation } from './fixtures/mutants.ts'
import { duration, instant } from './fixtures/provider.ts'

const options = {
  start: instant('2026-10-25T23:59:30Z'),
  short: duration('PT60S'),
  long: duration('PT86400S'),
}

async function failedCases(name: string, mutations: readonly Mutation[]) {
  const mutant = await mutantBuild(name, mutations)
  const fixture = governanceFixture(mutant.build)
  try {
    const report = await checkIdentityGovernanceContract(fixture.fixture, options)
    const failed = report.cases
      .filter(result => result.status === 'failed')
      .map(result => result.id)
    const evidence = process.env['IDENTITY_SQL_EVIDENCE_DIR']
    if (evidence !== undefined && evidence !== '') {
      mkdirSync(evidence, { recursive: true })
      writeFileSync(
        join(evidence, `negative-${name}.json`),
        JSON.stringify({ control: name, passed: report.passed, failed }, null, 2),
      )
    }
    return { passed: report.passed, failed }
  } finally {
    await fixture.close()
    mutant.remove()
  }
}

// Each check, and the cases that must fail without it.
const CONTROLS: readonly (readonly [CheckName, readonly string[]])[] = [
  ['last-admin', ['leave-last-admin-denied', 'last-admin-concurrent']],
  ['expected-role', ['change-role-expected-conflict']],
  [
    'revocation-ends-recognition',
    ['revoke-target', 'revoke-replay-no-change', 'revoked-stays-invalid-after-restart'],
  ],
  ['list-completeness', ['list-completeness-unavailable']],
]

describe('negative controls of the governance suite on the SQL provider', () => {
  it(
    'passes every case on an unchanged copy of the build',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const result = await failedCases('unchanged', [])
      expect(result.failed).toEqual([])
      expect(result.passed).toBe(true)
    },
  )

  it.each(CONTROLS)(
    'without the %s check, its cases fail',
    { tags: ['slow'], timeout: 300_000 },
    async (name, cases) => {
      const result = await failedCases(name, [CHECKS[name]])
      expect(result.passed).toBe(false)
      expect(result.failed).toEqual(expect.arrayContaining([...cases]))
    },
  )
})
