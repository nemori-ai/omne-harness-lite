import type { OwnedRecord } from '@omne-harness-lite/records'
import { describe, expect, it } from 'vitest'
import {
  decodeTenantRecord,
  foldBootstrapRecords,
  foldPersonalClaims,
  foldTenantRecords,
} from '../src/index.js'

const organization = {
  tenantId: 'tenant-1',
  kind: 'organization',
  creator: { kind: 'user', user: { userId: 'alice' } },
  status: 'active',
  members: [
    {
      member: { tenantId: 'tenant-1', userId: 'alice' },
      role: 'super_admin',
      state: 'active',
      revision: '1',
      joinedRevision: '1',
      delegatedOperations: [],
    },
  ],
} as const

function record(kind: string, data: unknown, version = '1'): OwnedRecord {
  return { kind, version, data: data as never }
}

describe('tenant record decoder and fold', () => {
  it('folds one bootstrap and a unique personal-tenant index', () => {
    const bootstrap = foldBootstrapRecords(null, [
      record('tenant.bootstrap_established', {
        bootstrapId: 'bootstrap-1',
        deploymentId: 'deployment-1',
        seedPrincipal: { kind: 'user', user: { userId: 'alice' } },
        initialRights: ['tenant.create_organization'],
      }),
    ])
    expect(bootstrap).toEqual({
      ok: true,
      value: {
        bootstrapId: 'bootstrap-1',
        deploymentId: 'deployment-1',
        seedPrincipal: { kind: 'user', user: { userId: 'alice' } },
        initialRights: ['tenant.create_organization'],
      },
    })
    if (!bootstrap.ok) throw new Error('expected bootstrap')
    expect(
      foldBootstrapRecords(bootstrap.value, [
        record('tenant.bootstrap_established', {
          bootstrapId: 'bootstrap-2',
          deploymentId: 'deployment-1',
          seedPrincipal: { kind: 'user', user: { userId: 'alice' } },
          initialRights: [],
        }),
      ]).ok,
    ).toBe(false)

    const claims = foldPersonalClaims(
      [],
      [record('tenant.personal_claimed', { user: { userId: 'alice' }, tenantId: 'personal-1' })],
    )
    expect(claims.ok).toBe(true)
    if (!claims.ok) throw new Error('expected personal claim')
    expect(
      foldPersonalClaims(claims.value, [
        record('tenant.personal_claimed', { user: { userId: 'alice' }, tenantId: 'personal-2' }),
      ]).ok,
    ).toBe(false)
    expect(
      foldPersonalClaims(claims.value, [
        record('tenant.personal_claimed', { user: { userId: 'bob' }, tenantId: 'personal-1' }),
      ]).ok,
    ).toBe(false)
  })

  it('decodes and freezes a valid organization root without adopting caller objects', () => {
    const input = record('tenant.created', { tenant: organization })

    const decoded = decodeTenantRecord(input)
    expect(decoded.ok).toBe(true)
    if (!decoded.ok) throw new Error('expected the record to decode')

    const folded = foldTenantRecords(null, [input])
    expect(folded.ok).toBe(true)
    if (!folded.ok) throw new Error('expected the record to fold')
    expect(folded.value.tenant).toEqual(organization)
    expect(folded.value.tenant).not.toBe(organization)
    expect(Object.isFrozen(folded.value)).toBe(true)
    expect(Object.isFrozen(folded.value.tenant.members)).toBe(true)
    expect(Object.isFrozen(folded.value.tenant.members[0])).toBe(true)
  })

  it('scopes join-revision reuse to the complete membership identity', () => {
    const folded = foldTenantRecords(null, [
      record('tenant.created', {
        tenant: {
          ...organization,
          members: [
            organization.members[0],
            {
              member: { tenantId: 'tenant-1', userId: 'bob' },
              role: 'member',
              state: 'active',
              revision: '1',
              joinedRevision: '1',
              delegatedOperations: [],
            },
          ],
        },
      }),
    ])

    expect(folded.ok).toBe(true)
  })

  it('rejects unknown versions, unknown kinds, malformed members, and invalid personal roots', () => {
    expect(decodeTenantRecord(record('tenant.created', { tenant: organization }, '2')).ok).toBe(
      false,
    )
    expect(decodeTenantRecord(record('tenant.future', {})).ok).toBe(false)
    expect(
      decodeTenantRecord(
        record('tenant.created', {
          tenant: {
            ...organization,
            members: [{ ...organization.members[0], revision: 1 }],
          },
        }),
      ).ok,
    ).toBe(false)
    expect(
      foldTenantRecords(null, [
        record('tenant.created', {
          tenant: {
            ...organization,
            kind: 'personal',
            members: [
              { ...organization.members[0], role: 'owner' },
              {
                ...organization.members[0],
                member: { tenantId: 'tenant-1', userId: 'bob' },
                role: 'member',
              },
            ],
          },
        }),
      ]).ok,
    ).toBe(false)
  })

  it('applies a valid member update and rejects revision or joined-revision resurrection', () => {
    const created = foldTenantRecords(null, [record('tenant.created', { tenant: organization })])
    if (!created.ok) throw new Error('expected initial organization')
    const bob = {
      member: { tenantId: 'tenant-1', userId: 'bob' },
      role: 'member',
      state: 'active',
      revision: '1',
      joinedRevision: '2',
      delegatedOperations: ['tenant.members'],
    } as const
    const added = foldTenantRecords(created.value, [
      record('tenant.member_changed', {
        member: bob,
        previousRevision: '0',
        reason: 'invite',
      }),
    ])
    expect(added.ok).toBe(true)
    if (!added.ok) throw new Error('expected member add')

    const removed = foldTenantRecords(added.value, [
      record('tenant.member_changed', {
        member: { ...bob, state: 'removed', revision: '2' },
        previousRevision: '1',
        reason: 'remove',
      }),
    ])
    expect(removed.ok).toBe(true)
    if (!removed.ok) throw new Error('expected member removal')

    expect(
      foldTenantRecords(removed.value, [
        record('tenant.member_changed', {
          member: { ...bob, state: 'active', revision: '3' },
          previousRevision: '2',
          reason: 'rejoin-with-stale-identity',
        }),
      ]).ok,
    ).toBe(false)
    expect(
      foldTenantRecords(removed.value, [
        record('tenant.member_changed', {
          member: { ...bob, state: 'active', revision: '4', joinedRevision: '3' },
          previousRevision: '2',
          reason: 'skip-member-revision',
        }),
      ]).ok,
    ).toBe(false)
  })
})
