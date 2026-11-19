import { describe, expect, it } from 'vitest'
import type { RegisteredWorkspace } from '@omne-harness/workspace-contract'
import { createInstances, createManagementTypes } from '@omne-harness/workspace'
import { fakeAccess, fakeMinting } from '@omne-harness/workspace/testing'
import { op, world } from './world.ts'

const [ALICE, BOB] = [fakeAccess(1), fakeAccess(2)]
const NONE = { kind: 'none' }

async function registered(w: ReturnType<typeof world>, address: string) {
  w.things.put(address, { kinds: ['plain', 'versioned'], resource: address })
  const answer = await w.governance.register(ALICE, { operation: op(`r${address}`), address })
  if (answer.kind !== 'done') throw new Error(JSON.stringify(answer))
  return answer.value
}
const located = ({ workspace, instance }: RegisteredWorkspace) => ({
  kind: 'located',
  workspace,
  instance,
})

describe('an address is found as the instance it is, for those who have a relation with its workspace', () => {
  it('finds the instance at an address among the workspaces of the caller, and nothing at another address', async () => {
    const w = world()
    const [blog, shop] = [await registered(w, '/blog'), await registered(w, '/shop')]
    expect(await w.instances.locate(ALICE, '/blog')).toEqual(located(blog))
    expect(await w.instances.locate(ALICE, '/shop')).toEqual(located(shop))
    expect(await w.instances.locate(ALICE, '/blog/src')).toEqual(NONE)
    expect(await w.instances.locate(ALICE, '')).toEqual(NONE)
  })

  it('finds an instance that was associated later, and no longer one that was dissociated', async () => {
    const w = world()
    w.things.put('/a', { kinds: ['plain', 'versioned'], resource: 'repo' })
    w.things.put('/b', { kinds: ['plain', 'versioned'], resource: 'repo' })
    const made = await w.governance.register(ALICE, { operation: op('r'), address: '/a' })
    if (made.kind !== 'done') throw new Error(JSON.stringify(made))
    const { workspace } = made.value
    expect(await w.instances.locate(ALICE, '/b')).toEqual(NONE)
    const more = await w.instances.associate(ALICE, {
      operation: op('a'),
      workspace,
      address: '/b',
    })
    if (more.kind !== 'done') throw new Error(JSON.stringify(more))
    const { instance } = more.value
    expect(await w.instances.locate(ALICE, '/b')).toEqual({ kind: 'located', workspace, instance })
    await w.instances.dissociate(ALICE, { operation: op('d'), workspace, instance })
    expect(await w.instances.locate(ALICE, '/b')).toEqual(NONE)
  })

  it('says nothing is there to a tenant without a relation, and finds it once the tenant takes part', async () => {
    const w = world()
    const blog = await registered(w, '/blog')
    expect(await w.instances.locate(BOB, '/blog')).toEqual(NONE)
    await w.governance.grantParticipation(ALICE, {
      operation: op('g'),
      workspace: blog.workspace,
      target: BOB.tenant,
    })
    expect(await w.instances.locate(BOB, '/blog')).toEqual(located(blog))
  })

  it('asks whether the caller may list on this node, and says nothing is there when it may not', async () => {
    const w = world()
    await registered(w, '/blog')
    const before = w.authority.asked().length
    await w.instances.locate(ALICE, '/blog')
    expect(w.authority.asked().slice(before)).toEqual([
      { action: 'workspace.list', target: 'node-1' },
    ])
    w.authority.admits(() => 'denied')
    expect(await w.instances.locate(ALICE, '/blog')).toEqual(NONE)
    w.authority.admits(() => 'unavailable')
    expect(await w.instances.locate(ALICE, '/blog')).toMatchObject({ kind: 'unavailable' })
    expect(
      await w.instances.locate({ principal: 'p', tenant: { ...ALICE.tenant } }, '/blog'),
    ).toEqual(NONE)
  })

  it('finds nothing on another node: the same text there is another place', async () => {
    const w = world()
    const blog = await registered(w, '/blog')
    const elsewhere = createInstances({
      authority: w.authority,
      store: w.store,
      types: createManagementTypes(),
      minting: fakeMinting(),
      node: 'node-2',
    })
    expect(await elsewhere.locate(ALICE, '/blog')).toEqual(NONE)
    expect(await w.instances.locate(ALICE, '/blog')).toEqual(located(blog))
  })

  it('could not look when the facts cannot be read, and does not say nothing is there', async () => {
    const w = world()
    await registered(w, '/blog')
    const { store } = w
    const memberships = store.memberships.bind(store)
    const state = store.state.bind(store)
    Object.assign(store, { state: async () => ({ kind: 'unavailable' }) })
    expect(await w.instances.locate(ALICE, '/blog')).toEqual({
      kind: 'unavailable',
      diagnostic: 'store',
    })
    Object.assign(store, { state, memberships: async () => ({ kind: 'unavailable' }) })
    expect(await w.instances.locate(ALICE, '/blog')).toEqual({
      kind: 'unavailable',
      diagnostic: 'store',
    })
    Object.assign(store, { memberships })
    expect(await w.instances.locate(ALICE, '/blog')).toMatchObject({ kind: 'located' })
  })
})
