import { describe, expect, it } from 'vitest'
import { parseDuration, parseInstant, type Duration, type Instant } from '@omne-harness/utc-instant'
import {
  IDENTITY_CONTRACT_CASES,
  IDENTITY_GOVERNANCE_CONTRACT_CASES,
  adjustableInvitationTerms,
  checkIdentityGovernanceContract,
  checkIdentityOperationsContract,
  inProcessIdentity,
  type IdentityGovernanceContractFixture,
  type IdentityGovernanceContractOptions,
  type InProcessIdentity,
} from '@omne-harness/identity/testing'

function instant(text: string): Instant {
  const parsed = parseInstant(text)
  if (!parsed.ok) throw new Error(`fixture instant ${text}`)
  return parsed.value
}

function duration(text: string): Duration {
  const parsed = parseDuration(text)
  if (!parsed.ok) throw new Error(`fixture duration ${text}`)
  return parsed.value
}

const doubleFixture: IdentityGovernanceContractFixture = {
  create: inProcessIdentity,
  injectsRecordFaults: true,
  restart: providers => Promise.resolve((providers as InProcessIdentity).restart()),
}

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

// The acceptance names of identity/spec.md groups A, B, C and F3 that the suite owns.
const SPEC_CASES = [
  'create-team-atomic',
  'create-call-replay',
  'create-call-conflict',
  'create-unknown-model-denied',
  'query-create-recall',
  'issue-requires-super-admin',
  'issue-personal-denied',
  'issue-unknown-not-visible',
  'issue-duration-range',
  'issue-default-duration-frozen',
  'accept-first-join-member',
  'rejoin-same-tenant-member',
  'former-admin-rejoins-as-member',
  'accept-already-member-no-change',
  'accept-by-other-account-denied',
  'accept-unknown-not-visible',
  'terminal-race',
  'expired-persisted',
  'terminal-replay-no-change',
  'leave-self',
  'leave-personal-denied',
  'leave-last-admin-denied',
  'remove-requires-super-admin',
  'change-role-expected-conflict',
  'last-admin-concurrent',
  'role-change-not-by-invite',
  'list-completeness-unavailable',
  'switch-member-target',
  'switch-non-member-denied',
  'switch-other-account-denied',
  'switch-same-no-change',
  'switch-other-login-unaffected',
  'switch-stale-acting-denied',
  'current-initial-personal',
  'current-after-switch',
  'current-unavailable',
  'revoke-target',
  'revoke-cross-account-not-visible',
  'revoke-replay-no-change',
  'revoked-initiator-denied',
  'revoke-other-logins-kept',
  'revoked-stays-invalid-after-restart',
  'own-logins-complete',
  'own-logins-no-proof',
  'own-logins-excludes-revoked-and-expired',
  'idle-refreshed-by-success',
  'idle-not-refreshed-by-failure',
  'idle-not-refreshed-by-governance',
  'idle-other-login-unaffected',
  'idle-expired-not-revived',
  'diagnostics-no-secret',
]

describe('the governance contract suite on the reference double', () => {
  it.each(CONFIGURATIONS)('passes every case with %s', async (_name, options) => {
    const report = await checkIdentityGovernanceContract(doubleFixture, options)
    expect(report.cases.filter(result => result.status !== 'passed')).toEqual([])
    expect(report.passed).toBe(true)
    expect(report.cases.map(result => result.id)).toEqual(
      IDENTITY_GOVERNANCE_CONTRACT_CASES.map(c => c.id),
    )
  })

  it('names every acceptance case of the identity spec, plus one positive and one refusal per read face', () => {
    const ids = IDENTITY_GOVERNANCE_CONTRACT_CASES.map(c => c.id)
    expect(ids).toEqual(expect.arrayContaining(SPEC_CASES))
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.filter(id => !SPEC_CASES.includes(id)).sort()).toEqual(
      [
        'invitation-read-visibility',
        'issued-invitations-admin-only',
        'members-not-visible',
        'members-read-and-removed',
        'own-memberships-active-only',
        'received-invitations-own',
      ].sort(),
    )
  })

  it('reports the restart cases as not applicable for a fixture that cannot restart', async () => {
    const [, options] = CONFIGURATIONS[0]!
    const report = await checkIdentityGovernanceContract(
      { create: inProcessIdentity, injectsRecordFaults: true },
      options,
    )
    expect(report.passed).toBe(true)
    expect(
      report.cases.filter(result => result.status === 'not-applicable').map(result => result.id),
    ).toEqual(['revoked-stays-invalid-after-restart'])
  })

  it('refuses options whose short lifetime is not shorter than the long one', async () => {
    const [, options] = CONFIGURATIONS[0]!
    await expect(
      checkIdentityGovernanceContract(doubleFixture, { ...options, short: options.long }),
    ).rejects.toThrow(RangeError)
  })

  it('refuses a window that spans a leap second', async () => {
    await expect(
      checkIdentityGovernanceContract(doubleFixture, {
        start: instant('2016-12-31T12:00:00Z'),
        short: duration('PT60S'),
        long: duration('PT3600S'),
      }),
    ).rejects.toThrow(RangeError)
  })

  it('reports a provider that throws as a failed case, not a throw', async () => {
    const [, options] = CONFIGURATIONS[0]!
    const report = await checkIdentityGovernanceContract(
      {
        create: injected => {
          const real = inProcessIdentity(injected)
          return {
            operations: real.operations,
            governance: {
              ...real.governance,
              revokeLogin: () => Promise.reject(new Error('lost reply')),
            },
          }
        },
      },
      options,
    )
    expect(report.passed).toBe(false)
    const revoke = report.cases.find(result => result.id === 'revoke-target')
    expect(revoke?.status).toBe('failed')
    expect(revoke?.detail).toBe('the case threw Error')
  })
})

describe('the operations double shared with governance', () => {
  it('still passes the operations contract suite', async () => {
    const report = await checkIdentityOperationsContract(
      {
        injectsRecordFaults: true,
        create: options => {
          const invitationTerms = adjustableInvitationTerms({
            defaultDuration: duration('PT60S'),
            maxDuration: duration('PT600S'),
          })
          return inProcessIdentity({ ...options, invitationTerms: invitationTerms.source })
            .operations
        },
      },
      CONFIGURATIONS[0]![1],
    )
    expect(report.cases.filter(result => result.status === 'failed')).toEqual([])
    expect(report.cases.map(result => result.id)).toEqual(IDENTITY_CONTRACT_CASES.map(c => c.id))
  })
})
