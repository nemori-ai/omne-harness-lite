import type {
  Access,
  AgentAccessCheck,
  AgentReceivedProvider,
  ToolReceptionTargets,
} from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import type { ModelReceptionCapacity } from './receiving-types.ts'

// The target query and its binding are contract types (agent-contract J02 item 1, R2-D273); this
// module names them again so that the existing imports of `@omne-harness/agent` keep working.
export type { ToolReceptionTarget, ToolReceptionTargets } from '@omne-harness/agent-contract'

export type ToolReceptionCapacity = ModelReceptionCapacity
export type ToolReceiverDependencies<P> = Readonly<{
  provider: AgentReceivedProvider<P, ContentBlock>
  access: AgentAccessCheck<P>
  targets: ToolReceptionTargets<P>
  capacity(tenant: Access<P>['tenant']): ToolReceptionCapacity
}>
