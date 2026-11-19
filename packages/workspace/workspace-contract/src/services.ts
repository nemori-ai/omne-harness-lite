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
  /** The caller becomes the owner, the directory the first instance. Nothing in it is touched. */
  register(
    access: Access<P>,
    input: Readonly<{ operation: OperationId; address: string; type?: TypeName }>,
  ): Promise<Answer<RegisteredWorkspace>>

  operation(access: Access<P>, operation: OperationId): Promise<OperationView>
}

export interface WorkspaceInstances<P> {
  /** One more materialisation: only when the type admits it and someone asks. */
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
  list(access: Access<P>): Promise<Read<readonly WorkspaceSummary[]>>
  describe(access: Access<P>, workspace: WorkspaceId): Promise<Read<WorkspaceView> | NotPermitted>
}
