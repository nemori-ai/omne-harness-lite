import { describe, expect, it } from 'vitest'
import { fakeAccess, fakeTenant, fakeWorkspaceId } from '@omne-harness/workspace/testing'
import { op, world } from './world.ts'

const ALICE = fakeAccess(1)
const BOB = fakeAccess(2)
const CAROL = fakeAccess(3)
const bob = fakeTenant(2)
const carol = fakeTenant(3)
const DONE = { kind: 'done', value: null, changed: true }
const SAME = { kind: 'done', value: null, changed: false }
const DENIED = { kind: 'not-permitted' }

/** A world where alice owns one workspace of the directory /a. */
async function owned() {
  const w = world()
  w.things.put('/a', { kinds: ['plain'] })
  const answer = await w.governance.register(ALICE, { operation: op('r1'), address: '/a' })
  if (answer.kind !== 'done') throw new Error('the registration did not happen')
  const { workspace } = answer.value
  const standing = async (access: typeof ALICE) => {
    const listed = await w.catalog.list(access)
    return listed.kind === 'read' ? (listed.value[0]?.standing ?? 'none') : 'unreadable'
  }
  return { ...w, workspace, standing }
}

describe('the owner governs who takes part', () => {
  it('grants participation, makes and unmakes a super-admin, and removes', async () => {
    const w = await owned()
    const { governance: g, workspace } = w
    const grant = { operation: op('g1'), workspace, target: bob }
    expect(await g.grantParticipation(ALICE, grant)).toEqual(DONE)
    expect(await w.standing(BOB)).toBe('participant')
    expect(await g.grantParticipation(ALICE, grant)).toEqual(SAME)
    expect(await g.grantParticipation(ALICE, { ...grant, operation: op('g2') })).toEqual(SAME)
    expect(await g.grantAdmin(ALICE, { ...grant, operation: op('a1') })).toEqual(DONE)
    expect(await w.standing(BOB)).toBe('admin')
    expect(await g.revokeAdmin(ALICE, { ...grant, operation: op('a2') })).toEqual(DONE)
    expect(await w.standing(BOB)).toBe('participant')
    expect(await g.remove(ALICE, { ...grant, operation: op('x1') })).toEqual(DONE)
    expect(await w.standing(BOB)).toBe('none')
    expect(await w.standing(ALICE)).toBe('owner')
    expect(w.authority.asked().map(asked => asked.action)).toEqual(
      expect.arrayContaining([
        'workspace.grant-participation',
        'workspace.grant-admin',
        'workspace.revoke-admin',
        'workspace.remove',
      ]),
    )
  })

  it('a super-admin grants participation and removes a participant, and no more than that', async () => {
    const w = await owned()
    const { governance: g, workspace } = w
    await g.grantParticipation(ALICE, { operation: op('g1'), workspace, target: bob })
    await g.grantAdmin(ALICE, { operation: op('a1'), workspace, target: bob })
    const onCarol = { workspace, target: carol }
    expect(await g.grantParticipation(BOB, { ...onCarol, operation: op('b1') })).toEqual(DONE)
    expect(await g.grantAdmin(BOB, { ...onCarol, operation: op('b2') })).toEqual(DENIED)
    expect(await g.remove(BOB, { ...onCarol, operation: op('b3') })).toEqual(DONE)
    expect(await w.standing(CAROL)).toBe('none')
    const onAlice = { workspace, target: fakeTenant(1) }
    expect(await g.remove(BOB, { ...onAlice, operation: op('b4') })).toEqual(DENIED)
    expect(await w.standing(ALICE)).toBe('owner')
  })

  it('a participant leaves; the owner cannot', async () => {
    const w = await owned()
    const { governance: g, workspace } = w
    await g.grantParticipation(ALICE, { operation: op('g1'), workspace, target: bob })
    expect(await g.leave(ALICE, { operation: op('l1'), workspace })).toEqual(DENIED)
    expect(await g.leave(BOB, { operation: op('l2'), workspace })).toEqual(DONE)
    expect(await w.standing(BOB)).toBe('none')
    expect(await g.leave(BOB, { operation: op('l3'), workspace })).toEqual(DENIED)
  })

  it('says what was not performed and why', async () => {
    const { governance: g, workspace } = await owned()
    const onBob = { workspace, target: bob }
    expect(await g.grantAdmin(ALICE, { ...onBob, operation: op('a1') })).toEqual({
      kind: 'not-performed',
      reason: 'not-a-participant',
    })
    expect(await g.revokeAdmin(ALICE, { ...onBob, operation: op('a2') })).toEqual({
      kind: 'not-performed',
      reason: 'not-an-admin',
    })
    const self = { workspace, target: fakeTenant(1) }
    expect(await g.grantAdmin(ALICE, { ...self, operation: op('a3') })).toEqual({
      kind: 'not-performed',
      reason: 'owner-needs-none',
    })
  })
})

describe('what stands before a change to a relation', () => {
  it('a target that is no tenant is not permitted, and one that cannot be read is unavailable', async () => {
    const w = await owned()
    const { governance: g, workspace } = w
    const grant = { operation: op('g1'), workspace, target: bob }
    w.authority.tenantIs(() => 'not-member')
    expect(await g.grantParticipation(ALICE, grant)).toEqual(DENIED)
    const unread = { kind: 'unavailable', diagnostic: 'target' }
    w.authority.tenantIs(() => 'unavailable')
    expect(await g.grantParticipation(ALICE, grant)).toEqual(unread)
    w.authority.tenantIs(() => 'throw')
    expect(await g.grantParticipation(ALICE, grant)).toEqual(unread)
    expect(await w.standing(BOB)).toBe('none')
    w.authority.tenantIs(() => 'member')
    expect(await g.grantParticipation(ALICE, grant)).toEqual(DONE)
  })

  it('only granting participation asks whether the target is a tenant', async () => {
    const w = await owned()
    const { governance: g, workspace } = w
    await g.grantParticipation(ALICE, { operation: op('g1'), workspace, target: bob })
    w.authority.tenantIs(() => 'not-member')
    expect(await g.remove(ALICE, { operation: op('x1'), workspace, target: bob })).toEqual(DONE)
  })

  it('a caller the authority does not admit changes nothing', async () => {
    const w = await owned()
    const { governance: g, workspace } = w
    const grant = { operation: op('g1'), workspace, target: bob }
    w.authority.admits(() => 'denied')
    expect(await g.grantParticipation(ALICE, grant)).toEqual(DENIED)
    expect(await g.destroy(ALICE, { operation: op('d1'), workspace })).toEqual(DENIED)
    w.authority.admits(() => 'unavailable')
    expect(await g.grantParticipation(ALICE, grant)).toMatchObject({ kind: 'unavailable' })
    w.authority.admits(() => 'allowed')
    expect(await w.standing(BOB)).toBe('none')
    expect(await w.standing(ALICE)).toBe('owner')
  })

  it('a name that is no operation name is not performed; a workspace nobody registered is not permitted', async () => {
    const { governance: g, workspace } = await owned()
    const bad = { operation: 'a b' as never, workspace, target: bob }
    expect(await g.grantParticipation(ALICE, bad)).toEqual({
      kind: 'not-performed',
      reason: 'invalid-request',
    })
    expect(await g.destroy(ALICE, { operation: 'a b' as never, workspace })).toEqual({
      kind: 'not-performed',
      reason: 'invalid-request',
    })
    const elsewhere = { operation: op('g1'), workspace: fakeWorkspaceId(99), target: bob }
    expect(await g.grantParticipation(ALICE, elsewhere)).toEqual(DENIED)
  })

  it('an operation name used again for another target or another workspace is a conflict', async () => {
    const w = await owned()
    const { governance: g, workspace } = w
    w.things.put('/b', { kinds: ['plain'] })
    const other = await g.register(ALICE, { operation: op('r2'), address: '/b' })
    if (other.kind !== 'done') throw new Error('the second registration did not happen')
    const grant = { operation: op('g1'), workspace, target: bob }
    expect(await g.grantParticipation(ALICE, grant)).toEqual(DONE)
    expect(await g.grantParticipation(ALICE, { ...grant, target: carol })).toEqual({
      kind: 'conflict',
    })
    expect(
      await g.grantParticipation(ALICE, { ...grant, workspace: other.value.workspace }),
    ).toEqual({ kind: 'conflict' })
    expect(await g.destroy(ALICE, { operation: op('d1'), workspace })).toEqual(DONE)
    expect(
      await g.destroy(ALICE, { operation: op('d1'), workspace: other.value.workspace }),
    ).toEqual({ kind: 'conflict' })
    expect(await w.standing(CAROL)).toBe('none')
  })

  it('a commit whose receipt was lost is unknown, and asking about the operation says it was done', async () => {
    const w = await owned()
    const { governance: g, workspace } = w
    const grant = { operation: op('g1'), workspace, target: bob }
    w.store.fail('lost')
    expect(await g.grantParticipation(ALICE, grant)).toEqual({
      kind: 'unknown',
      operation: 'g1',
    })
    w.store.fail('none')
    expect(await g.operation(ALICE, op('g1'))).toEqual({
      kind: 'recorded',
      operation: 'grant-participation',
      value: null,
    })
    expect(await g.grantParticipation(ALICE, grant)).toEqual(SAME)
  })
})

describe('destroying a workspace', () => {
  it('ends every relation and association, touches nothing physical, and frees the directory', async () => {
    const w = await owned()
    const { governance: g, workspace } = w
    await g.grantParticipation(ALICE, { operation: op('g1'), workspace, target: bob })
    const looked = w.things.looks()
    expect(await g.destroy(ALICE, { operation: op('d1'), workspace })).toEqual(DONE)
    expect(w.things.looks()).toBe(looked)
    expect(await w.standing(ALICE)).toBe('none')
    expect(await w.standing(BOB)).toBe('none')
    expect(await w.catalog.describe(ALICE, workspace)).toEqual(DENIED)
    expect(await g.destroy(ALICE, { operation: op('d1'), workspace })).toEqual(SAME)
    expect(await g.destroy(ALICE, { operation: op('d2'), workspace })).toEqual(DENIED)
    const again = await g.register(ALICE, { operation: op('r2'), address: '/a' })
    expect(again).toMatchObject({ kind: 'done', changed: true })
    expect(again.kind === 'done' && again.value.workspace).not.toBe(workspace)
    expect(w.authority.asked().map(asked => asked.action)).toContain('workspace.destroy')
  })

  it('a participant does not destroy', async () => {
    const w = await owned()
    const { governance: g, workspace } = w
    await g.grantParticipation(ALICE, { operation: op('g1'), workspace, target: bob })
    expect(await g.destroy(BOB, { operation: op('d1'), workspace })).toEqual(DENIED)
    expect(await w.standing(ALICE)).toBe('owner')
  })
})
