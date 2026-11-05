import type {
  Access,
  AgentAccessCheck,
  AgentAccountOutlet,
  AgentReceivedProvider,
  ModelReceptionTargets,
} from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import type { ModelCalls } from '@omne-harness/model-contract'

// The target query and its binding are contract types (agent-contract J02 item 1); this module
// names them again so that the existing imports of `@omne-harness/agent` keep working.
export type { ModelReceptionTarget, ModelReceptionTargets } from '@omne-harness/agent-contract'

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
