import type {
  InstanceId,
  Json,
  OperationKind,
  Relation,
  TypeName,
} from '@omne-harness/workspace-contract'

/** Facts cross to the storage worker as plain data: a workspace and a tenant are their text here. */
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
  /** Unique among the active instances of a node. */
  occupancy: string
  address: string
  material: Json
  state: 'active' | 'dissociated'
}>

export type OperationRecord = Readonly<{
  tenant: string
  operation: string
  kind: OperationKind
  digest: string
  value: Json
}>

/** One storage transaction. Synchronous: a script runs to completion in the storage worker. */
export interface WorkspaceTxn {
  operation(tenant: string, operation: string): OperationRecord | null
  insertOperation(record: OperationRecord): void

  workspace(workspace: string): WorkspaceRecord | null
  insertWorkspace(record: WorkspaceRecord): void
  setRevision(workspace: string, revision: number): void

  relation(workspace: string, tenant: string): Relation | null
  putRelation(workspace: string, tenant: string, relation: Relation): void
  endRelation(workspace: string, tenant: string): void
  endRelations(workspace: string): void

  sourceRevision(workspace: string, tenant: string): number
  bumpSource(workspace: string, tenant: string): void
  bumpSources(workspace: string): void

  instance(instance: string): InstanceRecord | null
  /** The active instance at this position, whatever workspace it belongs to. */
  occupant(node: string, occupancy: string): InstanceRecord | null
  insertInstance(record: InstanceRecord): void
  setInstanceState(instance: string, state: InstanceRecord['state']): void
  dissociateInstances(workspace: string): void
}
