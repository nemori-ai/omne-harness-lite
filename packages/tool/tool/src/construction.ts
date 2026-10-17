// The construction shapes of the Tool runtime factory and the ledger factory. They belong to the
// implementation, not to the contract: another implementation may take different dependencies
// and configuration.
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
  ToolRuntime,
  ToolStartAuthority,
} from '@omne-harness/tool-contract'

export type ToolConfiguration = ToolAuthorLimits &
  Readonly<{
    processBatchBytes: number
    processBatchDelayMs: number
    observerBufferBytes: number
    /** The most bytes of whole content blocks on one result page (P08). */
    resultPageBytes: number
    reconciliationDelayMs: number
    /** How many times a ledger command re-reads and re-decides after a revision conflict. */
    ledgerCommitAttempts: number
  }>

/** The part of the configuration that the ledger reads. The same configuration value fits. */
export type ToolLedgerConfiguration = Pick<
  ToolConfiguration,
  'resultPageBytes' | 'ledgerCommitAttempts'
>

/**
 * The admission entry of this ledger. It answers what the runtime admit answers: the state, and
 * whether the ledger recalled an admission that was already committed (P01). The contract's
 * `ToolCommands.admit` answers the state only.
 */
export type ToolLedgerAdmissions<P> = Readonly<{
  admit: ToolRuntime<P, ContentBlock>['admit']
}>

export type ToolDependencies<P, B extends ContentBlock, E> = Readonly<{
  commands: ToolCommands<P, B>
  admissions: ToolLedgerAdmissions<P>
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
