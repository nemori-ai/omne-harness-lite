import type { Relation } from '@omne-harness/workspace-contract'
import type {
  AssociateCommand,
  AssociateResult,
  DissociateCommand,
  DissociateResult,
} from './transactions/instances.ts'
import type { RegisterCommand, RegisterResult } from './transactions/register.ts'
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

/**
 * The repository, in the words of the domain. The facts belong to no single tenant, so every
 * entry names the tenant it is for and returns only what that tenant has a relation with:
 * a workspace of others reads the same as one that does not exist.
 */
export interface WorkspaceStore {
  register(command: RegisterCommand): Promise<StoreAnswer<RegisterResult>>
  associate(command: AssociateCommand): Promise<StoreAnswer<AssociateResult>>
  dissociate(command: DissociateCommand): Promise<StoreAnswer<DissociateResult>>

  membership(tenant: string, workspace: string): Promise<StoreRead<Membership | null>>
  memberships(tenant: string): Promise<StoreRead<readonly Membership[]>>
  /** The active instances of a workspace this tenant has a relation with; null without a relation. */
  instances(tenant: string, workspace: string): Promise<StoreRead<readonly InstanceRecord[] | null>>
  operation(tenant: string, operation: string): Promise<StoreRead<OperationRecord | null>>
}
