import type { Relation } from '@omne-harness/workspace-contract'
import type {
  DestroyCommand,
  DestroyResult,
  RelationCommand,
  RelationResult,
} from './transactions/governance.ts'
import type {
  AssociateCommand,
  AssociateResult,
  DissociateCommand,
  DissociateResult,
} from './transactions/instances.ts'
import type { RegisterCommand, RegisterResult } from './transactions/register.ts'
import type { AdoptCommand, AdoptResult, StoredAdoption } from './transactions/sources.ts'
import type { InstanceRecord, OperationRecord, WorkspaceRecord } from './txn.ts'

/** What a commit answered. `unknown`: it is not known whether the facts were written. */
export type StoreAnswer<T> =
  | Readonly<{ kind: 'committed'; value: T }>
  | Readonly<{ kind: 'rolled-back' }>
  | Readonly<{ kind: 'unknown' }>

/** A read either returns the facts or says it could not read. It never answers empty instead. */
export type StoreRead<T> = Readonly<{ kind: 'read'; value: T }> | Readonly<{ kind: 'unavailable' }>

/** A workspace as one tenant sees it: the workspace and that tenant's relation with it. */
export type Membership = Readonly<{ workspace: WorkspaceRecord; relation: Relation }>

/** A membership with the workspace's active instances, read at one moment. */
export type WorkspaceState = Membership & Readonly<{ instances: readonly InstanceRecord[] }>

/** The repository, in the words of the domain. */
export interface WorkspaceStore {
  register(command: RegisterCommand): Promise<StoreAnswer<RegisterResult>>
  associate(command: AssociateCommand): Promise<StoreAnswer<AssociateResult>>
  dissociate(command: DissociateCommand): Promise<StoreAnswer<DissociateResult>>
  govern(command: RelationCommand): Promise<StoreAnswer<RelationResult>>
  destroy(command: DestroyCommand): Promise<StoreAnswer<DestroyResult>>
  adopt(command: AdoptCommand): Promise<StoreAnswer<AdoptResult>>

  /** Null without a relation, whether or not the workspace exists. */
  state(tenant: string, workspace: string): Promise<StoreRead<WorkspaceState | null>>
  memberships(tenant: string): Promise<StoreRead<readonly Membership[]>>
  operation(tenant: string, operation: string): Promise<StoreRead<OperationRecord | null>>
  sourceRevision(tenant: string, workspace: string): Promise<StoreRead<number>>
  adoption(
    tenant: string,
    workspace: string,
    key: string,
  ): Promise<StoreRead<StoredAdoption | null>>
}
