import { describe, expect, it } from 'vitest'
import type { RegisteredWorkspace } from '@omne-harness/workspace-contract'
import { fakeAccess } from '@omne-harness/workspace/testing'
import { op, world } from './world.ts'

const ALICE = fakeAccess(1)
const BOB = fakeAccess(2)

async function registered(
  w: ReturnType<typeof world>,
  address: string,
): Promise<RegisteredWorkspace> {
  w.things.put(address, { kinds: ['plain', 'versioned'], resource: 'repo' })
  const answer = await w.governance.register(ALICE, {
    operation: op(`register-${address}`),
    address,
  })
  if (answer.kind !== 'done') throw new Error(JSON.stringify(answer))
  return answer.value
}

describe('associating one more instance', () => {
  it('a tenant without a relation is not permitted, and nothing says the workspace exists', async () => {
    const w = world()
    const made = await registered(w, '/a')
    w.things.put('/b', { kinds: ['plain', 'versioned'], resource: 'repo' })
    const looks = w.things.looks()
    expect(
      await w.instances.associate(BOB, {
        operation: op('a1'),
        workspace: made.workspace,
        address: '/b',
      }),
    ).toEqual({ kind: 'not-permitted' })
    expect(w.things.looks()).toBe(looks)
  })

  it('is recalled by its operation name and conflicts on another input', async () => {
    const w = world()
    const made = await registered(w, '/a')
    w.things.put('/b', { kinds: ['plain', 'versioned'], resource: 'repo' })
    w.things.put('/c', { kinds: ['plain', 'versioned'], resource: 'repo' })
    const input = { operation: op('a1'), workspace: made.workspace, address: '/b' }
    const first = await w.instances.associate(ALICE, input)
    expect(first).toMatchObject({ kind: 'done', changed: true })
    expect(await w.instances.associate(ALICE, input)).toEqual({ ...first, changed: false })
    expect(await w.instances.associate(ALICE, { ...input, address: '/c' })).toEqual({
      kind: 'conflict',
    })
  })

  it('decides again when the workspace changed after it was read', async () => {
    const w = world()
    const made = await registered(w, '/a')
    w.things.put('/b', { kinds: ['plain', 'versioned'], resource: 'repo' })
    w.things.put('/c', { kinds: ['plain', 'versioned'], resource: 'repo' })
    w.store.interleave(async () => {
      await w.instances.associate(ALICE, {
        operation: op('other'),
        workspace: made.workspace,
        address: '/c',
      })
    })
    const answer = await w.instances.associate(ALICE, {
      operation: op('a1'),
      workspace: made.workspace,
      address: '/b',
    })
    expect(answer).toMatchObject({ kind: 'done', changed: true })
    const view = await w.catalog.describe(ALICE, made.workspace)
    expect(
      view.kind === 'read' && view.value.instances.map(instance => instance.address).sort(),
    ).toEqual(['/a', '/b', '/c'])
  })

  it('a position held by an instance of another workspace is occupied', async () => {
    const w = world()
    const made = await registered(w, '/a')
    w.things.put('/b', { kinds: ['plain', 'versioned'], resource: 'repo' })
    await w.governance.register(BOB, { operation: op('r'), address: '/b' })
    expect(
      await w.instances.associate(ALICE, {
        operation: op('a1'),
        workspace: made.workspace,
        address: '/b',
      }),
    ).toEqual({ kind: 'not-performed', reason: 'occupied' })
  })

  it('a workspace whose type is withdrawn is unavailable, not refused and not retyped', async () => {
    const w = world()
    const made = await registered(w, '/a')
    w.things.put('/b', { kinds: ['plain', 'versioned'], resource: 'repo' })
    w.withdrawVersioned()
    const expected = { kind: 'unavailable', diagnostic: 'type-not-contributed' }
    expect(
      await w.instances.associate(ALICE, {
        operation: op('a1'),
        workspace: made.workspace,
        address: '/b',
      }),
    ).toEqual(expected)
    expect(await w.instances.verify(ALICE, made)).toEqual(expected)
    const view = await w.catalog.describe(ALICE, made.workspace)
    expect(view).toMatchObject({
      kind: 'read',
      value: {
        type: 'versioned',
        instances: [{ availability: { kind: 'unknown', diagnostic: 'type-not-contributed' } }],
      },
    })
  })

  it('a lost receipt is unknown and the operation can be asked about', async () => {
    const w = world()
    const made = await registered(w, '/a')
    w.things.put('/b', { kinds: ['plain', 'versioned'], resource: 'repo' })
    w.store.fail('lost')
    expect(
      await w.instances.associate(ALICE, {
        operation: op('a1'),
        workspace: made.workspace,
        address: '/b',
      }),
    ).toEqual({ kind: 'unknown', operation: 'a1' })
    w.store.fail('none')
    expect(await w.governance.operation(ALICE, op('a1'))).toMatchObject({
      kind: 'recorded',
      operation: 'associate',
    })
  })
})

describe('dissociating an instance', () => {
  it('twice with two operation names is done once and then unchanged', async () => {
    const w = world()
    const made = await registered(w, '/a')
    const target = { workspace: made.workspace, instance: made.instance }
    expect(await w.instances.dissociate(ALICE, { operation: op('d1'), ...target })).toEqual({
      kind: 'done',
      value: null,
      changed: true,
    })
    expect(await w.instances.dissociate(ALICE, { operation: op('d2'), ...target })).toEqual({
      kind: 'done',
      value: null,
      changed: false,
    })
    const view = await w.catalog.describe(ALICE, made.workspace)
    expect(view).toMatchObject({ kind: 'read', value: { instances: [] } })
  })

  it('its operation name used for another instance is a conflict', async () => {
    const w = world()
    const made = await registered(w, '/a')
    w.things.put('/b', { kinds: ['plain', 'versioned'], resource: 'repo' })
    const added = await w.instances.associate(ALICE, {
      operation: op('a1'),
      workspace: made.workspace,
      address: '/b',
    })
    if (added.kind !== 'done') throw new Error('not associated')
    await w.instances.dissociate(ALICE, {
      operation: op('d1'),
      workspace: made.workspace,
      instance: made.instance,
    })
    expect(
      await w.instances.dissociate(ALICE, {
        operation: op('d1'),
        workspace: made.workspace,
        instance: added.value.instance,
      }),
    ).toEqual({ kind: 'conflict' })
  })

  it('a tenant without a relation, or an instance of another workspace, is not permitted', async () => {
    const w = world()
    const one = await registered(w, '/a')
    const two = await registered(w, '/b')
    expect(
      await w.instances.dissociate(BOB, {
        operation: op('d1'),
        workspace: one.workspace,
        instance: one.instance,
      }),
    ).toEqual({ kind: 'not-permitted' })
    expect(
      await w.instances.dissociate(ALICE, {
        operation: op('d2'),
        workspace: one.workspace,
        instance: two.instance,
      }),
    ).toEqual({ kind: 'not-permitted' })
    expect((await w.instances.verify(ALICE, two)).kind).toBe('attachable')
  })

  it('the workspace stays when its last instance goes, and takes a new one', async () => {
    const w = world()
    const made = await registered(w, '/a')
    await w.instances.dissociate(ALICE, {
      operation: op('d1'),
      workspace: made.workspace,
      instance: made.instance,
    })
    w.things.put('/moved', { kinds: ['plain', 'versioned'], resource: 'elsewhere' })
    const again = await w.instances.associate(ALICE, {
      operation: op('a1'),
      workspace: made.workspace,
      address: '/moved',
    })
    expect(again).toMatchObject({ kind: 'done', changed: true })
    expect((await w.catalog.list(ALICE)).kind === 'read').toBe(true)
  })
})
