// The construction shapes of the Tool runtime factory. They belong to the implementation, not to
// the contract: another implementation may take different dependencies and configuration.
import type { ContentBlock } from '@omne-harness/content-block'
import type {
  ResultPolicy,
  ToolAuthorLimits,
  ToolBindings,
  ToolCatalog,
  ToolChildren,
  ToolClock,
  ToolCommands,
  ToolDecisionBridge,
  ToolEnvironment,
  ToolInstanceHost,
  ToolOutputCustody,
  ToolReads,
  ToolResourceResponses,
  ToolStartAuthority,
} from '@omne-harness/tool-contract'

export type ToolConfiguration = ToolAuthorLimits &
  Readonly<{
    processBatchBytes: number
    processBatchDelayMs: number
    observerBufferBytes: number
    resultPageBytes: number
    reconciliationDelayMs: number
  }>
export type ToolDependencies<P, B extends ContentBlock, E> = Readonly<{
  commands: ToolCommands<P, B>
  bindings: ToolBindings<P, B, E>
  environments: ToolEnvironment<P, E>
  decisions: ToolDecisionBridge<P>
  instances: ToolInstanceHost<P>
  clock: ToolClock
  resultPolicy: ResultPolicy<B>
  authority: ToolStartAuthority<P>
  resources: ToolResourceResponses<P>
  custody: ToolOutputCustody<P>
  catalog: ToolCatalog<P>
  reads: ToolReads<P, B>
  children: ToolChildren<P>
}>
