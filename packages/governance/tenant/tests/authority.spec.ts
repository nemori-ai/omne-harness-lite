import type { MembershipRef } from '@omne-harness-lite/work-data'
import { describe, expect, it } from 'vitest'
import { qualifyTenantManagement } from '../src/authority.js'
import type { Member, TenantFoldState } from '../src/records.js'

const alice: MembershipRef = { tenantId: 'tenant-1', userId: 'alice' }
const bob: MembershipRef = { tenantId: 'tenant-1', userId: 'bob' }

function member(
  identity: MembershipRef,
  role: Member['role'],
  revision: string,
  joinedRevision: string,
  delegatedOperations: readonly string[] = [],
  state: Member['state'] = 'active',
): Member {
  return {
    member: identity,
    role,
    state,
    revision,
    joinedRevision,
    delegatedOperations,
  }
}

function root(members: readonly Member[], history: readonly Member[] = members): TenantFoldState {
  return {
    tenant: {
      tenantId: 'tenant-1',
      kind: 'organization',
      creator: { kind: 'user', user: { userId: 'alice' } },
      status: 'active',
      members,
    },
    joinHistory: history.map(({ member, joinedRevision }) => ({ member, joinedRevision })),
  }
}

describe('current tenant management qualification', () => {
  it('uses a durable positive basis and returns its complete membership identity', () => {
    expect(
      qualifyTenantManagement(
        root([member(alice, 'super_admin', '1', '1')]),
        [],
        alice,
        'tenant.members',
      ),
    ).toEqual({
      status: 'ready',
      membership: { member: alice, joinedRevision: '1', observedRevision: '1' },
    })
  })

  it('keeps an intermediate pending downgrade effective until the whole prefix is durable', () => {
    const durable = root([member(alice, 'super_admin', '1', '1'), member(bob, 'member', '1', '1')])
    const downgraded = root([
      member(alice, 'member', '2', '1'),
      member(bob, 'super_admin', '2', '1'),
    ])
    const restored = root([member(alice, 'super_admin', '3', '1'), member(bob, 'member', '3', '1')])

    expect(
      qualifyTenantManagement(durable, [downgraded, restored], alice, 'tenant.members'),
    ).toEqual({ status: 'denied', code: 'membership_not_authorized' })
    expect(qualifyTenantManagement(restored, [], alice, 'tenant.members')).toEqual({
      status: 'ready',
      membership: { member: alice, joinedRevision: '1', observedRevision: '3' },
    })
  })

  it('does not use a pending grant as a positive qualification', () => {
    const durable = root([member(alice, 'super_admin', '1', '1'), member(bob, 'member', '1', '1')])
    const granted = root([
      member(alice, 'super_admin', '1', '1'),
      member(bob, 'member', '2', '1', ['tenant.members']),
    ])

    expect(qualifyTenantManagement(durable, [granted], bob, 'tenant.members')).toEqual({
      status: 'denied',
      code: 'qualification_not_durable',
    })
    expect(qualifyTenantManagement(granted, [], bob, 'tenant.members')).toEqual({
      status: 'ready',
      membership: { member: bob, joinedRevision: '1', observedRevision: '2' },
    })
  })

  it('does not let a pending remove and rejoin revive the durable join basis', () => {
    const original = member(bob, 'member', '2', '1', ['tenant.members'])
    const removed = member(bob, 'member', '3', '1', ['tenant.members'], 'removed')
    const rejoined = member(bob, 'member', '4', '4', ['tenant.members'])
    const history = [original, rejoined]
    const durable = root([member(alice, 'super_admin', '1', '1'), original])

    expect(
      qualifyTenantManagement(
        durable,
        [
          root([member(alice, 'super_admin', '1', '1'), removed], history),
          root([member(alice, 'super_admin', '1', '1'), rejoined], history),
        ],
        bob,
        'tenant.members',
      ),
    ).toEqual({ status: 'denied', code: 'membership_not_current' })
  })

  it('fails closed for another tenant and for an operation outside this slice', () => {
    const durable = root([member(alice, 'super_admin', '1', '1')])

    expect(
      qualifyTenantManagement(
        durable,
        [],
        { tenantId: 'tenant-2', userId: 'alice' },
        'tenant.members',
      ),
    ).toEqual({ status: 'denied', code: 'membership_not_current' })
    expect(qualifyTenantManagement(durable, [], alice, 'session.read_content')).toEqual({
      status: 'unavailable',
      code: 'operation_not_supported',
    })
  })
})
