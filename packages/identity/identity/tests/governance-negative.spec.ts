// Negative controls of the governance contract suite: switch off one check of the reference double
// at a time and show that the cases written for it turn red. The switch is internal to the double's
// module; `./testing` does not export it.
import { expect, it } from 'vitest'
import { parseDuration, parseInstant } from '@omne-harness/utc-instant'
import { checkIdentityGovernanceContract } from '@omne-harness/identity/testing'
import { inProcessIdentityWithout } from '../src/testing/governance-double.ts'
import type { DoubleCheck } from '../src/testing/records.ts'

const start = parseInstant('2026-10-25T23:59:30Z')
const short = parseDuration('PT60S')
const long = parseDuration('PT86400S')
if (!start.ok || !short.ok || !long.ok) throw new Error('fixture time invalid')
const options = { start: start.value, short: short.value, long: long.value }

// Each switched-off set of checks, and the cases that must fail without it. Leaving a personal
// organization is also stopped by the last administrator check, so that control switches off both;
// the concurrent removal holds only while a check and its write are one commit.
const CONTROLS: readonly (readonly [string, readonly DoubleCheck[], readonly string[]])[] = [
  ['last-admin', ['last-admin'], ['leave-last-admin-denied', 'last-admin-concurrent']],
  ['expected-role', ['expected-role'], ['change-role-expected-conflict']],
  ['uniform-not-visible', ['uniform-not-visible'], ['revoke-cross-account-not-visible']],
  [
    'revocation-ends-recognition',
    ['revocation-ends-recognition'],
    ['revoke-target', 'revoke-replay-no-change', 'revoked-stays-invalid-after-restart'],
  ],
  ['super-admin', ['super-admin'], ['issue-requires-super-admin', 'remove-requires-super-admin']],
  ['personal-organization', ['personal-organization'], ['issue-personal-denied']],
  [
    'personal-organization and last-admin',
    ['personal-organization', 'last-admin'],
    ['leave-personal-denied'],
  ],
  ['atomic-commit', ['atomic-commit'], ['last-admin-concurrent']],
  ['acting-tenant', ['acting-tenant'], ['switch-stale-acting-denied']],
  [
    'switch-membership',
    ['switch-membership'],
    ['switch-non-member-denied', 'switch-other-account-denied'],
  ],
  ['invitee-only', ['invitee-only'], ['accept-by-other-account-denied']],
  [
    'invitation-visibility',
    ['invitation-visibility'],
    ['accept-unknown-not-visible', 'invitation-read-visibility'],
  ],
  ['single-terminal', ['single-terminal'], ['terminal-race', 'terminal-replay-no-change']],
  ['expiry-persisted', ['expiry-persisted'], ['expired-persisted']],
  ['duration-range', ['duration-range'], ['issue-duration-range']],
  ['create-binding', ['create-binding'], ['create-call-conflict']],
  ['model', ['model'], ['create-unknown-model-denied']],
  [
    'initiator-valid',
    ['initiator-valid'],
    ['revoked-initiator-denied', 'own-memberships-active-only'],
  ],
  ['removed-requires-admin', ['removed-requires-admin'], ['members-read-and-removed']],
  ['list-completeness', ['list-completeness'], ['list-completeness-unavailable']],
  ['refresh-live-only', ['refresh-live-only'], ['idle-expired-not-revived']],
]

it.each(CONTROLS)('without the %s check, its cases fail', async (_name, checks, cases) => {
  const report = await checkIdentityGovernanceContract(
    {
      create: injected => inProcessIdentityWithout(injected, checks),
      injectsRecordFaults: true,
      restart: providers =>
        Promise.resolve((providers as ReturnType<typeof inProcessIdentityWithout>).restart()),
    },
    options,
  )
  const failed = report.cases.filter(result => result.status === 'failed').map(result => result.id)
  expect(report.passed).toBe(false)
  expect(failed).toEqual(expect.arrayContaining([...cases]))
})
