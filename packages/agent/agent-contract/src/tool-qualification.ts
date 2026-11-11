import type { ToolCallId, ToolInvokeRequest, ToolOperationId } from '@omne-harness/tool-contract'
import type {
  Access,
  Adoption,
  AgentExecutionId,
  DurableEvidence,
  ExecutionRevision,
} from './identity.ts'
import type { Reply } from './evaluation.ts'

export type ToolQualificationRequest<P> = Access<P> &
  Readonly<{
    call: ToolCallId
    admission: ToolOperationId
    request: ToolInvokeRequest
  }>

/** Agent provenance only. Tool verifies the invocation, and consumers recheck this revision. */
export type ToolQualification = Readonly<{
  version: 1
  request: Omit<ToolQualificationRequest<unknown>, 'principal'>
  execution: AgentExecutionId
  association: 'intent' | 'associated'
  agentDefinition: Adoption
  revision: ExecutionRevision
  history: DurableEvidence
}>

export interface AgentToolQualification<P> {
  qualify(input: ToolQualificationRequest<P>): Reply<ToolQualification>
}
