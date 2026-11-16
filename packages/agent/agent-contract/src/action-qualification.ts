import type { ActionAdmission } from './passages.ts'
import type { Adoption, DurableEvidence, ExecutionRevision } from './identity.ts'
import type { Reply } from './evaluation.ts'

export type ActionQualificationRequest<P> = Omit<
  Parameters<ActionAdmission<P>['admit']>[0],
  'permissions' | 'decision'
>

export type ActionQualification = Readonly<{
  version: 1
  request: Omit<ActionQualificationRequest<unknown>, 'principal'>
  agentDefinition: Adoption
  revision: ExecutionRevision
  history: DurableEvidence
}>

export interface AgentActionQualification<P> {
  qualify(input: ActionQualificationRequest<P>): Reply<ActionQualification>
}
