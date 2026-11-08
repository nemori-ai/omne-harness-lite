import type { ActionAdmission } from './passages.ts'
import type { Adoption, DurableEvidence, ExecutionRevision } from './identity.ts'
import type { Reply } from './evaluation.ts'

/** The original action position, without a permission decision or a request to grant anything. */
export type ActionQualificationRequest<P> = Omit<
  Parameters<ActionAdmission<P>['admit']>[0],
  'permissions' | 'decision'
>

/** An original-owner observation. Its revision must be checked again at the consuming commit. */
export type ActionQualification = Readonly<{
  version: 1
  request: Omit<ActionQualificationRequest<unknown>, 'principal'>
  /** Original Agent adoption from the same Journal snapshot, separate from the requested Tool. */
  agentDefinition: Adoption
  revision: ExecutionRevision
  history: DurableEvidence
}>

export interface AgentActionQualification<P> {
  qualify(input: ActionQualificationRequest<P>): Reply<ActionQualification>
}
