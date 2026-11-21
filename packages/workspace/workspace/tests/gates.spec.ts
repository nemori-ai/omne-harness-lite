import { describe, expect, it } from 'vitest'
import { workspaceCodec } from '@omne-harness/legal-identity'
import type { InstanceId, RegisteredWorkspace } from '@omne-harness/workspace-contract'
import {
  createGovernance,
  createInstances,
  createManagementTypes,
  type WorkspaceStore,
} from '@omne-harness/workspace'
import {
  createMemoryStore,
  fakeAccess,
  fakeAuthority,
  fakeMinting,
  fakeWorld,
  fakeWorkspaceId,
} from '@omne-harness/workspace/testing'
import { op, world } from './world.ts'

const ALICE = fakeAccess(1)
const FORGED = { principal: 'p', tenant: { ...ALICE.tenant } }
const text = (made: RegisteredWorkspace) => {
  const encoded = workspaceCodec.encode(made.workspace)
  return encoded.ok ? encoded.value : ''
}

async function registered(w: ReturnType<typeof world>): Promise<RegisteredWorkspace> {
  w.things.put('/a', { kinds: ['plain', 'versioned'], resource: 'repo' })
  w.things.put('/b', { kinds: ['plain', 'versioned'], resource: 'repo' })
  const answer = await w.governance.register(ALICE, { operation: op('register'), address: '/a' })
  if (answer.kind !== 'done') throw new Error(JSON.stringify(answer))
  return answer.value
}

describe('every operation names its action and its target when it asks', () => {
  it('asks about the workspace for what is done to a workspace, about the node otherwise', async () => {
    const w = world()
    const made = await registered(w)
    const before = w.authority.asked().length
    await w.catalog.list(ALICE)
    await w.governance.operation(ALICE, op('register'))
    await w.catalog.describe(ALICE, made.workspace)
    await w.instances.verify(ALICE, made)
    await w.instances.associate(ALICE, {
      operation: op('a'),
      workspace: made.workspace,
      address: '/b',
    })
    await w.instances.dissociate(ALICE, {
      operation: op('d'),
      workspace: made.workspace,
      instance: made.instance,
    })
    expect(w.authority.asked().slice(before)).toEqual([
      { action: 'workspace.list', target: 'node-1' },
      { action: 'workspace.recall', target: 'node-1' },
      { action: 'workspace.view', target: text(made) },
      { action: 'workspace.attach', target: text(made) },
      { action: 'workspace.associate', target: text(made) },
      { action: 'workspace.dissociate', target: text(made) },
    ])
  })
})

describe('an identity that was not parsed is refused before anything is asked', () => {
  const calls = (made: RegisteredWorkspace) =>
    [
      ['a forged tenant', FORGED, made.workspace, made.instance],
      ['a forged workspace', ALICE, { ...made.workspace }, made.instance],
    ] as const

  it.each(['associate', 'dissociate', 'verify'] as const)('%s', async operation => {
    const w = world()
    const made = await registered(w)
    const before = w.authority.asked().length
    for (const [, caller, workspace, instance] of calls(made)) {
      const answer =
        operation === 'associate'
          ? await w.instances.associate(caller, { operation: op('x'), workspace, address: '/b' })
          : operation === 'dissociate'
            ? await w.instances.dissociate(caller, { operation: op('x'), workspace, instance })
            : await w.instances.verify(caller, { workspace, instance })
      expect(answer).toEqual({ kind: 'not-permitted' })
    }
    const malformed = 'not-an-instance' as InstanceId
    if (operation === 'dissociate')
      expect(
        await w.instances.dissociate(ALICE, {
          operation: op('x'),
          workspace: made.workspace,
          instance: malformed,
        }),
      ).toEqual({ kind: 'not-permitted' })
    if (operation === 'verify')
      expect(
        await w.instances.verify(ALICE, { workspace: made.workspace, instance: malformed }),
      ).toEqual({
        kind: 'not-permitted',
      })
    expect(w.authority.asked().length).toBe(before)
  })

  it('describing and asking about an operation too', async () => {
    const w = world()
    const made = await registered(w)
    const before = w.authority.asked().length
    expect(await w.catalog.describe(FORGED, made.workspace)).toEqual({ kind: 'not-permitted' })
    expect(await w.catalog.describe(ALICE, { ...made.workspace })).toEqual({
      kind: 'not-permitted',
    })
    expect(await w.governance.operation(FORGED, op('register'))).toEqual({ kind: 'not-permitted' })
    expect(await w.governance.operation(ALICE, 'two words' as never)).toEqual({
      kind: 'not-permitted',
    })
    expect(w.authority.asked().length).toBe(before)
  })
})

describe('a source that does not answer is named in the diagnostic', () => {
  it.each([
    ['standing', 'unavailable', 'allowed'],
    ['admission', 'member', 'unavailable'],
    ['authority', 'throw', 'allowed'],
    ['authority', 'member', 'throw'],
  ] as const)('%s: standing %s, admission %s', async (diagnostic, standing, admission) => {
    const w = world()
    const made = await registered(w)
    w.authority.standingIs(() => standing)
    w.authority.admits(() => admission)
    const expected = { kind: 'unavailable', diagnostic }
    expect(await w.instances.verify(ALICE, made)).toEqual(expected)
    expect(await w.catalog.describe(ALICE, made.workspace)).toEqual(expected)
    expect(await w.catalog.list(ALICE)).toEqual(expected)
    expect(
      await w.instances.associate(ALICE, {
        operation: op('a'),
        workspace: made.workspace,
        address: '/b',
      }),
    ).toEqual(expected)
    expect(
      await w.instances.dissociate(ALICE, {
        operation: op('d'),
        workspace: made.workspace,
        instance: made.instance,
      }),
    ).toEqual(expected)
  })

  it('a caller who is not admitted is not permitted, and the type is not asked to look', async () => {
    const w = world()
    const made = await registered(w)
    w.authority.admits(() => 'denied')
    const looks = w.things.looks()
    expect(
      await w.instances.associate(ALICE, {
        operation: op('a'),
        workspace: made.workspace,
        address: '/b',
      }),
    ).toEqual({ kind: 'not-permitted' })
    expect(
      await w.instances.dissociate(ALICE, {
        operation: op('d'),
        workspace: made.workspace,
        instance: made.instance,
      }),
    ).toEqual({ kind: 'not-permitted' })
    expect(await w.catalog.describe(ALICE, made.workspace)).toEqual({ kind: 'not-permitted' })
    expect(w.things.looks()).toBe(looks)
  })

  it('the store', async () => {
    const w = world()
    const made = await registered(w)
    w.store.fail('unreadable')
    const expected = { kind: 'unavailable', diagnostic: 'store' }
    expect(await w.instances.verify(ALICE, made)).toEqual(expected)
    expect(await w.catalog.list(ALICE)).toEqual(expected)
    expect(await w.governance.operation(ALICE, op('register'))).toEqual(expected)
    expect(
      await w.instances.associate(ALICE, {
        operation: op('a'),
        workspace: made.workspace,
        address: '/b',
      }),
    ).toEqual(expected)
    w.store.fail('rolled-back')
    expect(
      await w.instances.dissociate(ALICE, {
        operation: op('d'),
        workspace: made.workspace,
        instance: made.instance,
      }),
    ).toEqual(expected)
  })

  it('a type that throws, or cannot look', async () => {
    const things = fakeWorld()
    const plain = things.type('plain')
    let broken = false
    const types = createManagementTypes()
    types.contribute({
      ...plain,
      recognise: async address => {
        if (broken) throw new Error('disk error')
        return plain.recognise(address)
      },
      inspect: async material => {
        if (broken) throw new Error('disk error')
        return plain.inspect(material)
      },
    })
    const deps = {
      authority: fakeAuthority(),
      store: createMemoryStore(),
      types,
      minting: fakeMinting(),
      node: 'n',
    }
    const governance = createGovernance(deps)
    const instances = createInstances(deps)
    things.put('/a', {})
    const made = await governance.register(ALICE, { operation: op('r'), address: '/a' })
    if (made.kind !== 'done') throw new Error('not registered')
    broken = true
    const expected = { kind: 'unavailable', diagnostic: 'type' }
    expect(await governance.register(ALICE, { operation: op('r2'), address: '/b' })).toEqual(
      expected,
    )
    expect(await instances.verify(ALICE, made.value)).toEqual(expected)
    expect(
      await instances.associate(ALICE, {
        operation: op('a'),
        workspace: made.value.workspace,
        address: '/b',
      }),
    ).toEqual(expected)
    broken = false
    things.things.get('/a')!.state = 'unreadable'
    expect(await instances.verify(ALICE, made.value)).toEqual({
      kind: 'unavailable',
      diagnostic: 'unreadable',
    })
  })
})

describe('associating: what the caller sent, and what the type said', () => {
  it.each([
    ['an empty address', { operation: op('a'), address: '' }],
    ['an address that is not text', { operation: op('a'), address: 7 as never }],
    ['an operation name that is not one', { operation: 'two words' as never, address: '/b' }],
  ])('%s is an invalid request', async (_name, input) => {
    const w = world()
    const made = await registered(w)
    expect(await w.instances.associate(ALICE, { ...input, workspace: made.workspace })).toEqual({
      kind: 'not-performed',
      reason: 'invalid-request',
    })
    expect(
      await w.instances.dissociate(ALICE, {
        operation: 'two words' as never,
        workspace: made.workspace,
        instance: made.instance,
      }),
    ).toEqual({ kind: 'not-performed', reason: 'invalid-request' })
  })

  it("the type's refusal is the reason; a type that cannot look is unavailable", async () => {
    const w = world()
    const made = await registered(w)
    expect(
      await w.instances.associate(ALICE, {
        operation: op('a'),
        workspace: made.workspace,
        address: '/nowhere',
      }),
    ).toEqual({ kind: 'not-performed', reason: 'not-found' })
    w.things.things.get('/b')!.state = 'unreadable'
    expect(
      await w.instances.associate(ALICE, {
        operation: op('a'),
        workspace: made.workspace,
        address: '/b',
      }),
    ).toEqual({ kind: 'unavailable', diagnostic: 'unreadable' })
  })

  it('gives up as contended when the workspace keeps changing under it', async () => {
    const w = world()
    const made = await registered(w)
    let churned = 0
    const churn = async (): Promise<void> => {
      const address = `/churn-${++churned}`
      w.things.put(address, { kinds: ['plain', 'versioned'], resource: 'repo' })
      await w.instances.associate(ALICE, {
        operation: op(address),
        workspace: made.workspace,
        address,
      })
      w.store.interleave(churn)
    }
    w.store.interleave(churn)
    expect(
      await w.instances.associate(ALICE, {
        operation: op('a'),
        workspace: made.workspace,
        address: '/b',
      }),
    ).toEqual({ kind: 'unavailable', diagnostic: 'contended' })
    expect(churned).toBe(3)
    expect(await w.governance.operation(ALICE, op('a'))).toEqual({ kind: 'not-recorded' })
  })
})

describe('the evidence of a verification names what was verified', () => {
  it('its record is the workspace and the instance, its revision the workspace revision', async () => {
    const w = world()
    const made = await registered(w)
    const first = await w.instances.verify(ALICE, made)
    if (first.kind !== 'attachable') throw new Error('not attachable')
    expect(first.evidence).toMatchObject({
      owner: 'workspace',
      record: `${text(made)}/${made.instance}`,
      revision: '1',
    })
    const added = await w.instances.associate(ALICE, {
      operation: op('a'),
      workspace: made.workspace,
      address: '/b',
    })
    if (added.kind !== 'done') throw new Error('not associated')
    const second = await w.instances.verify(ALICE, {
      workspace: made.workspace,
      instance: added.value.instance,
    })
    if (second.kind !== 'attachable') throw new Error('not attachable')
    expect(second.evidence.revision).toBe('2')
    expect(second.evidence.digest).not.toBe(first.evidence.digest)
    w.things.things.get('/a')!.version = 'v2'
    const moved = await w.instances.verify(ALICE, made)
    expect(moved.kind === 'attachable' && moved.evidence.digest).not.toBe(first.evidence.digest)
  })
})

describe('a store that answers what this group never wrote', () => {
  const answering = (value: unknown): WorkspaceStore => ({
    ...createMemoryStore(),
    register: async () =>
      ({ kind: 'committed', value: { kind: 'done', value, changed: true } }) as never,
    associate: async () =>
      ({ kind: 'committed', value: { kind: 'done', value, changed: true } }) as never,
    state: async () => ({
      kind: 'read',
      value: {
        workspace: { workspace: 'wsp_x', type: 'plain' as never, revision: 1 },
        relation: { role: 'owner' },
        instances: [],
      },
    }),
  })

  it.each([
    [{ workspace: 'garbage', instance: 'wsi_00000000000000000000000001', type: 'plain' }],
    [{ workspace: 'wsp_00000000000000000000000001', instance: 'garbage', type: 'plain' }],
    [
      {
        workspace: 'wsp_00000000000000000000000001',
        instance: 'wsi_00000000000000000000000001',
        type: 'NOT',
      },
    ],
  ])('%j is unavailable, not a success', async value => {
    const things = fakeWorld()
    things.put('/a', {})
    const types = createManagementTypes()
    types.contribute(things.type('plain'))
    const deps = {
      authority: fakeAuthority(),
      store: answering(value),
      types,
      minting: fakeMinting(),
      node: 'n',
    }
    expect(
      await createGovernance(deps).register(ALICE, { operation: op('r'), address: '/a' }),
    ).toEqual({
      kind: 'unavailable',
      diagnostic: 'stored-value',
    })
    if (value.instance !== 'garbage') return
    expect(
      await createInstances(deps).associate(ALICE, {
        operation: op('a'),
        workspace: fakeWorkspaceId(1),
        address: '/a',
      }),
    ).toEqual({ kind: 'unavailable', diagnostic: 'stored-value' })
  })
})
