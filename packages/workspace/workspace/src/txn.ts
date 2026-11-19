import type {
  InstanceId,
  Json,
  OperationKind,
  Relation,
  TypeName,
} from '@omne-harness/workspace-contract'

/**
 * The stored facts. They cross to the storage worker as plain data, so a workspace and a tenant
 * are their identity text here.
 */
export type WorkspaceRecord = Readonly<{
  workspace: string
  type: TypeName
  /** Counts every change to the workspace's relations and instances. */
  revision: number
}>

export type InstanceRecord = Readonly<{
  instance: InstanceId
  workspace: string
  node: string
  /** The physical position, in the words of the type. Unique among the active instances of a node. */
  occupancy: string
  /** The locator the instance was associated under. */
  address: string
  material: Json
  state: 'active' | 'dissociated'
}>

export type OperationRecord = Readonly<{
  tenant: string
  operation: string
  kind: OperationKind
  /** Digest of the input the operation was first done with. */
  digest: string
  value: Json
}>

/** The facts inside one storage transaction. Synchronous: a script runs to completion in the storage worker. */
export interface WorkspaceTxn {
  operation(tenant: string, operation: string): OperationRecord | null
  insertOperation(record: OperationRecord): void

  workspace(workspace: string): WorkspaceRecord | null
  insertWorkspace(record: WorkspaceRecord): void
  setRevision(workspace: string, revision: number): void

  relation(workspace: string, tenant: string): Relation | null
  putRelation(workspace: string, tenant: string, relation: Relation): void

  instance(instance: string): InstanceRecord | null
  /** The active instance at this position of this node, whatever workspace it belongs to. */
  occupant(node: string, occupancy: string): InstanceRecord | null
  insertInstance(record: InstanceRecord): void
  setInstanceState(instance: string, state: InstanceRecord['state']): void
}
