import { describe, expect, it } from 'vitest'
import type { InstanceId, TypeName } from '@omne-harness/workspace-contract'
import {
  associateInstance,
  dissociateInstance,
  registerWorkspace,
  type AssociateCommand,
  type RegisterCommand,
} from '@omne-harness/workspace'
import { emptyFacts, memoryTxn } from '@omne-harness/workspace/testing'

const instance = (name: string) => `wsi_${name.padStart(26, '0')}` as InstanceId

const register = (over: Partial<RegisterCommand> = {}): RegisterCommand => ({
  tenant: 'alice',
  operation: 'r1',
  digest: 'd-r1',
  workspace: 'wsp_1',
  instance: instance('1'),
  type: 'plain' as TypeName,
  node: 'node-1',
  occupancy: '/a',
  address: '/a',
  material: { root: '/a' },
  ...over,
})

const associate = (over: Partial<AssociateCommand> = {}): AssociateCommand => ({
  tenant: 'alice',
  operation: 'a1',
  digest: 'd-a1',
  workspace: 'wsp_1',
  instance: instance('2'),
  node: 'node-1',
  occupancy: '/b',
  address: '/b',
  material: { root: '/b' },
  revision: 1,
  ...over,
})

function registered() {
  const facts = emptyFacts()
  const txn = memoryTxn(facts)
  registerWorkspace(txn, register())
  return { facts, txn }
}

describe('the register script', () => {
  it('writes the workspace at revision 1, its owner and its active first instance', () => {
    const facts = emptyFacts()
    const result = registerWorkspace(memoryTxn(facts), register())
    expect(result).toEqual({
      kind: 'done',
      value: { workspace: 'wsp_1', instance: instance('1'), type: 'plain' },
      changed: true,
    })
    expect([...facts.workspaces.values()]).toEqual([
      { workspace: 'wsp_1', type: 'plain', revision: 1 },
    ])
    expect([...facts.relations.values()]).toEqual([{ role: 'owner' }])
    expect([...facts.instances.values()]).toMatchObject([
      {
        instance: instance('1'),
        workspace: 'wsp_1',
        node: 'node-1',
        occupancy: '/a',
        state: 'active',
      },
    ])
    expect([...facts.operations.values()]).toEqual([
      {
        tenant: 'alice',
        operation: 'r1',
        kind: 'register',
        digest: 'd-r1',
        value: result.kind === 'done' ? result.value : null,
      },
    ])
  })

  it('an occupied position writes nothing; another node is another position', () => {
    const { facts, txn } = registered()
    const second = register({
      operation: 'r2',
      digest: 'd-r2',
      workspace: 'wsp_2',
      instance: instance('2'),
    })
    expect(registerWorkspace(txn, second)).toEqual({ kind: 'not-performed', reason: 'occupied' })
    expect(facts.workspaces.size).toBe(1)
    expect(facts.operations.size).toBe(1)
    expect(registerWorkspace(txn, { ...second, node: 'node-2' }).kind).toBe('done')
  })

  it('the same name and digest is recalled; another digest, or another kind, is a conflict', () => {
    const { facts, txn } = registered()
    expect(
      registerWorkspace(txn, register({ workspace: 'wsp_9', instance: instance('9') })),
    ).toEqual({
      kind: 'done',
      value: { workspace: 'wsp_1', instance: instance('1'), type: 'plain' },
      changed: false,
    })
    expect(registerWorkspace(txn, register({ digest: 'other' }))).toEqual({ kind: 'conflict' })
    expect(associateInstance(txn, associate({ operation: 'r1', digest: 'd-r1' }))).toEqual({
      kind: 'conflict',
    })
    expect(facts.workspaces.size).toBe(1)
    expect(facts.instances.size).toBe(1)
  })
})

describe('the associate script', () => {
  it('adds the instance and moves the revision on by one', () => {
    const { facts, txn } = registered()
    expect(associateInstance(txn, associate())).toEqual({
      kind: 'done',
      value: { instance: instance('2') },
      changed: true,
    })
    expect(facts.workspaces.get('wsp_1')?.revision).toBe(2)
    expect(facts.instances.get(instance('2'))).toMatchObject({
      workspace: 'wsp_1',
      state: 'active',
    })
    expect(facts.operations.get(JSON.stringify(['alice', 'a1']))?.kind).toBe('associate')
  })

  it('a tenant without a relation, or a workspace that is not there, is not permitted and writes nothing', () => {
    const { facts, txn } = registered()
    expect(associateInstance(txn, associate({ tenant: 'bob' }))).toEqual({ kind: 'not-permitted' })
    expect(associateInstance(txn, associate({ workspace: 'wsp_none' }))).toEqual({
      kind: 'not-permitted',
    })
    expect(facts.instances.size).toBe(1)
    expect(facts.operations.size).toBe(1)
  })

  it('a revision other than the one it was decided at is stale', () => {
    const { facts, txn } = registered()
    expect(associateInstance(txn, associate({ revision: 0 }))).toEqual({ kind: 'stale' })
    expect(associateInstance(txn, associate({ revision: 2 }))).toEqual({ kind: 'stale' })
    expect(facts.instances.size).toBe(1)
  })

  it('an occupied position is not performed and the revision stays', () => {
    const { facts, txn } = registered()
    expect(associateInstance(txn, associate({ occupancy: '/a' }))).toEqual({
      kind: 'not-performed',
      reason: 'occupied',
    })
    expect(facts.workspaces.get('wsp_1')?.revision).toBe(1)
  })
})

describe('the dissociate script', () => {
  const dissociate = (operation: string, target = instance('1'), tenant = 'alice') =>
    ({ tenant, operation, digest: `d-${operation}`, workspace: 'wsp_1', instance: target }) as const

  it('ends the association, moves the revision on by one and records its kind', () => {
    const { facts, txn } = registered()
    expect(dissociateInstance(txn, dissociate('d1'))).toEqual({
      kind: 'done',
      value: null,
      changed: true,
    })
    expect(facts.instances.get(instance('1'))?.state).toBe('dissociated')
    expect(facts.workspaces.get('wsp_1')?.revision).toBe(2)
    expect(facts.operations.get(JSON.stringify(['alice', 'd1']))?.kind).toBe('dissociate')
    expect(registerWorkspace(txn, register({ operation: 'd1', digest: 'd-d1' }))).toEqual({
      kind: 'conflict',
    })
  })

  it('a second time changes nothing', () => {
    const { facts, txn } = registered()
    dissociateInstance(txn, dissociate('d1'))
    expect(dissociateInstance(txn, dissociate('d2'))).toEqual({
      kind: 'done',
      value: null,
      changed: false,
    })
    expect(facts.workspaces.get('wsp_1')?.revision).toBe(2)
  })

  it('an instance that is not there, or belongs to another workspace, is not permitted', () => {
    const { facts, txn } = registered()
    registerWorkspace(
      txn,
      register({
        operation: 'r2',
        digest: 'd-r2',
        workspace: 'wsp_2',
        instance: instance('7'),
        occupancy: '/z',
      }),
    )
    expect(dissociateInstance(txn, dissociate('d1', instance('404')))).toEqual({
      kind: 'not-permitted',
    })
    expect(dissociateInstance(txn, dissociate('d2', instance('7')))).toEqual({
      kind: 'not-permitted',
    })
    expect(dissociateInstance(txn, dissociate('d3', instance('1'), 'bob'))).toEqual({
      kind: 'not-permitted',
    })
    expect([...facts.instances.values()].map(record => record.state)).toEqual(['active', 'active'])
  })
})
