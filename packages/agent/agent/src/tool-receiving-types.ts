import type {
  Access,
  AgentAccessCheck,
  AgentReceivedProvider,
  ToolReceptionTargets,
} from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import type { ModelReceptionCapacity } from './receiving-types.ts'

export type { ToolReceptionTarget, ToolReceptionTargets } from '@omne-harness/agent-contract'

export type ToolReceptionCapacity = ModelReceptionCapacity
export type ToolReceiverDependencies<P> = Readonly<{
  provider: AgentReceivedProvider<P, ContentBlock>
  access: AgentAccessCheck<P>
  targets: ToolReceptionTargets<P>
  capacity(tenant: Access<P>['tenant']): ToolReceptionCapacity
}>
