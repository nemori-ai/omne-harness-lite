import type {
  Access,
  AgentAccessCheck,
  AgentExecutionId,
  AgentInstanceId,
  AgentReceivedProvider,
  ConsumerRef,
  PendingCall,
  Reply,
} from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import type { ToolInvocationRef } from '@omne-harness/tool-contract'
import type { ModelReceptionCapacity } from './receiving-types.ts'

export type ToolReceptionTarget = Readonly<{
  execution: AgentExecutionId
  instance: AgentInstanceId
  pending: Extract<PendingCall, { kind: 'tool'; association: 'associated' }>
}>

/** The provider checks current access before revealing a binding or its absence. */
export interface ToolReceptionTargets<P> {
  resolve(
    input: Readonly<{
      access: Access<P>
      consumer: ConsumerRef
      reference: ToolInvocationRef
    }>,
  ): Reply<ToolReceptionTarget | null>
  forExecution(
    input: Readonly<{
      access: Access<P>
      execution: AgentExecutionId
    }>,
  ): Reply<readonly ToolReceptionTarget[]>
}

export type ToolReceptionCapacity = ModelReceptionCapacity
export type ToolReceiverDependencies<P> = Readonly<{
  provider: AgentReceivedProvider<P, ContentBlock>
  access: AgentAccessCheck<P>
  targets: ToolReceptionTargets<P>
  capacity(tenant: Access<P>['tenant']): ToolReceptionCapacity
}>
