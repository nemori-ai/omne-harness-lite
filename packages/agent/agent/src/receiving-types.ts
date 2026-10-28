import type {
  Access,
  AgentAccessCheck,
  AgentAccountOutlet,
  AgentExecutionId,
  AgentInstanceId,
  AgentReceivedProvider,
  ConsumerRef,
  PendingCall,
  Reply,
} from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import type { ModelCalls, ModelInvocationRef } from '@omne-harness/model-contract'

export type ModelReceptionTarget = Readonly<{
  execution: AgentExecutionId
  instance: AgentInstanceId
  pending: Extract<PendingCall, { kind: 'model' }>
}>

/** Resolves the original committed consumption, independently of a live attachment. */
export interface ModelReceptionTargets<P> {
  forExecution(
    input: Readonly<{
      access: Access<P>
      execution: AgentExecutionId
    }>,
  ): Reply<readonly ModelReceptionTarget[]>
  resolve(
    input: Readonly<{
      access: Access<P>
      consumer: ConsumerRef
      reference: ModelInvocationRef
    }>,
  ): Reply<ModelReceptionTarget>
}

export type ModelReceptionCapacity = Readonly<{
  records: number
  bytes: number
  attachments: number
  inFlight: number
}>

export type ModelReceiverDependencies<P> = Readonly<{
  provider: AgentReceivedProvider<P, ContentBlock>
  access: AgentAccessCheck<P>
  targets: ModelReceptionTargets<P>
  outlet: AgentAccountOutlet<P>
  models: Pick<ModelCalls<P>, 'inspect' | 'dispatches'>
  capacity(tenant: Access<P>['tenant']): ModelReceptionCapacity
}>
