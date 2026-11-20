import type { Relation } from '@omne-harness/workspace-contract'
import type { Membership, StoreAnswer, StoreRead, WorkspaceStore } from '../store.ts'
import { associateInstance, dissociateInstance } from '../transactions/instances.ts'
import { registerWorkspace } from '../transactions/register.ts'
import type { InstanceRecord, OperationRecord, WorkspaceRecord, WorkspaceTxn } from '../txn.ts'

/** Every fact of the store. Plain data, so a transaction is a copy that replaces the original. */
export type WorkspaceFacts = {
  workspaces: Map<string, WorkspaceRecord>
  relations: Map<string, Relation>
  instances: Map<string, InstanceRecord>
  operations: Map<string, OperationRecord>
}

export const emptyFacts = (): WorkspaceFacts => ({
  workspaces: new Map(),
  relations: new Map(),
  instances: new Map(),
  operations: new Map(),
})

const pair = (left: string, right: string) => JSON.stringify([left, right])

export function memoryTxn(facts: WorkspaceFacts): WorkspaceTxn {
  return {
    operation: (tenant, operation) => facts.operations.get(pair(tenant, operation)) ?? null,
    insertOperation(record) {
      facts.operations.set(pair(record.tenant, record.operation), record)
    },
    workspace: workspace => facts.workspaces.get(workspace) ?? null,
    insertWorkspace(record) {
      facts.workspaces.set(record.workspace, record)
    },
    setRevision(workspace, revision) {
      facts.workspaces.set(workspace, { ...facts.workspaces.get(workspace)!, revision })
    },
    relation: (workspace, tenant) => facts.relations.get(pair(workspace, tenant)) ?? null,
    putRelation(workspace, tenant, relation) {
      facts.relations.set(pair(workspace, tenant), relation)
    },
    instance: instance => facts.instances.get(instance) ?? null,
    occupant: (node, occupancy) =>
      [...facts.instances.values()].find(
        record =>
          record.state === 'active' && record.node === node && record.occupancy === occupancy,
      ) ?? null,
    insertInstance(record) {
      facts.instances.set(record.instance, record)
    },
    setInstanceState(instance, state) {
      facts.instances.set(instance, { ...facts.instances.get(instance)!, state })
    },
  }
}

export type MemoryStore = WorkspaceStore &
  Readonly<{
    /** Decides what the next commits and reads answer. `lost` commits and then loses the receipt. */
    fail(mode: 'none' | 'rolled-back' | 'lost' | 'unreadable'): void
    /** Runs once before the next commit, after the caller has read: a change by someone else. */
    interleave(change: () => Promise<void>): void
  }>

export function createMemoryStore(): MemoryStore {
  let facts = emptyFacts()
  let mode: 'none' | 'rolled-back' | 'lost' | 'unreadable' = 'none'
  let pending: (() => Promise<void>) | null = null

  const copy = (): WorkspaceFacts => ({
    workspaces: new Map(facts.workspaces),
    relations: new Map(facts.relations),
    instances: new Map(facts.instances),
    operations: new Map(facts.operations),
  })

  async function commit<C, R>(
    script: (txn: WorkspaceTxn, command: C) => R,
    command: C,
  ): Promise<StoreAnswer<R>> {
    if (pending !== null) {
      const change = pending
      pending = null
      await change()
    }
    if (mode === 'rolled-back') return { kind: 'rolled-back' }
    const next = copy()
    // The command crosses to the storage worker as data in the real store; here too.
    const value = script(memoryTxn(next), structuredClone(command))
    facts = next
    return mode === 'lost' ? { kind: 'unknown' } : { kind: 'committed', value }
  }

  function read<T>(value: () => T): StoreRead<T> {
    return mode === 'unreadable' ? { kind: 'unavailable' } : { kind: 'read', value: value() }
  }

  function membership(tenant: string, workspace: string): Membership | null {
    const record = facts.workspaces.get(workspace)
    const relation = facts.relations.get(pair(workspace, tenant))
    return record === undefined || relation === undefined ? null : { workspace: record, relation }
  }

  return {
    fail(next) {
      mode = next
    },
    interleave(change) {
      pending = change
    },
    register: command => commit(registerWorkspace, command),
    associate: command => commit(associateInstance, command),
    dissociate: command => commit(dissociateInstance, command),
    state: async (tenant, workspace) =>
      read(() => {
        const found = membership(tenant, workspace)
        if (found === null) return null
        const instances = [...facts.instances.values()].filter(
          record => record.workspace === workspace && record.state === 'active',
        )
        return { ...found, instances }
      }),
    memberships: async tenant =>
      read(() =>
        [...facts.workspaces.keys()]
          .sort()
          .map(workspace => membership(tenant, workspace))
          .filter(found => found !== null),
      ),
    operation: async (tenant, operation) =>
      read(() => facts.operations.get(pair(tenant, operation)) ?? null),
  }
}
