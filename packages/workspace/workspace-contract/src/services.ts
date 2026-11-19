import type { Access, WorkspaceId } from '@omne-harness/legal-identity'
import type {
  Answer,
  InstanceId,
  NotPermitted,
  OperationId,
  OperationView,
  Read,
  RegisteredWorkspace,
  TypeName,
  Verification,
  WorkspaceSummary,
  WorkspaceView,
} from './values.ts'

/** Every operation names its subject and tenant. One with an effect also names itself. */
export interface WorkspaceGovernance<P> {
  /**
   * Makes a directory of this node a workspace: the caller becomes its governance owner and the
   * directory its first instance. Nothing in the directory is moved, written or removed.
   * Without `type` the most specific type that recognises the address takes it.
   */
  register(
    access: Access<P>,
    input: Readonly<{ operation: OperationId; address: string; type?: TypeName }>,
  ): Promise<Answer<RegisteredWorkspace>>

  /** What is recorded under an operation name of this tenant. */
  operation(access: Access<P>, operation: OperationId): Promise<OperationView>
}

export interface WorkspaceInstances<P> {
  /** Adds one more materialisation. It happens only when the type admits it and someone asks. */
  associate(
    access: Access<P>,
    input: Readonly<{ operation: OperationId; workspace: WorkspaceId; address: string }>,
  ): Promise<Answer<Readonly<{ instance: InstanceId }>>>

  /** Ends an instance's association. The physical resource stays as it is. */
  dissociate(
    access: Access<P>,
    input: Readonly<{ operation: OperationId; workspace: WorkspaceId; instance: InstanceId }>,
  ): Promise<Answer<null>>

  /** No effect, no fact written. Who calls it and when is the caller's business. */
  verify(
    access: Access<P>,
    input: Readonly<{ workspace: WorkspaceId; instance: InstanceId }>,
  ): Promise<Verification>
}

export interface WorkspaceCatalog<P> {
  /** Only the workspaces the caller has a relation with. No relation is an empty list. */
  list(access: Access<P>): Promise<Read<readonly WorkspaceSummary[]>>
  describe(access: Access<P>, workspace: WorkspaceId): Promise<Read<WorkspaceView> | NotPermitted>
}
