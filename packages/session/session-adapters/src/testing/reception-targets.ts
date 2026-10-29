import type {
  Access,
  AgentExecutionId,
  AgentInstanceId,
  ConsumerRef,
  PendingCall,
  Reply,
} from '@omne-harness/agent-contract'
import type { ModelInvocationRef } from '@omne-harness/model-contract'

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
