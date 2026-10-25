// The construction shapes of the Tool runtime factory and the ledger factory. They belong to the
// implementation, not to the contract: another implementation may take different dependencies
// and configuration.
import type { ContentBlock } from '@omne-harness/content-block'
import type {
  CallAccess,
  FixedToolRequest,
  DurableEvidence,
  Reply,
  ToolCallId,
  ToolCatalog,
  ToolState,
} from '@omne-harness/tool-contract'
import type {
  Mutation,
  ResultPolicy,
  ToolAuthorLimits,
  ToolBindings,
  ToolChildren,
  ToolContentReader,
  ToolClock,
  ToolCommands,
  ToolDecisionBridge,
  ToolEnvironment,
  ToolInstanceHost,
  ToolInvocationSourceIssuer,
  ToolOperationIdentities,
  ToolOutputCustody,
  ToolReads,
  ToolResourceResponses,
  ToolStartAuthority,
} from '@omne-harness/tool-contract/provider'

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
    /**
     * The most unreleased calls one FIFO key may hold (P02: a queue has a capacity, and a new
     * admission may be refused before it is committed). Distinct from the concurrency limit a
     * request fixes, which counts running executions.
     */
    queueCapacity: number
    /**
     * The most steps one driver run takes before it yields; a call that needs more is run again.
     * Absent means 16. It bounds a run, so a command that is excluded again and again cannot
     * hold the driver.
     */
    driverStepsPerRun?: number
    /**
     * How long, in milliseconds, the driver waits before it runs a call again after a run ended on
     * a store or port failure that said nothing about the call itself, after the environment
     * provider answered `pending` or `unknown`, or after a run used its whole step budget without
     * a step that committed or recalled a commit (SPEC 23). An integer from 1 to 2147483647 (the longest delay a timer
     * holds); absent means 1000. It is a policy: a host may set another value.
     */
    driverRetryDelayMs?: number
  }>

/** The part of the configuration that the ledger reads. The same configuration value fits. */
export type ToolLedgerConfiguration = Pick<
  ToolConfiguration,
  'resultPageBytes' | 'ledgerCommitAttempts' | 'queueCapacity'
>

/**
 * The admission entry of this ledger. It answers the state, and whether the ledger recalled an
 * admission that was already committed (P01). It is a trusted internal port: the caller fixes
 * the call, the admission operation and the whole fixed request, as the runtime does from the
 * ordinary invoke.
 */
export type ToolLedgerAdmissions<P> = Readonly<{
  admit(
    input: Mutation<P> & Readonly<{ request: FixedToolRequest }>,
  ): Reply<Readonly<{ state: ToolState; recovered: boolean }>>
}>

/**
 * What the queue domain's reconcile found for a waiting call's key: the calls whose place it
 * released, and the calls that still owe the queue domain a step.
 */
export type QueueReconciliation = Readonly<{
  /** The calls whose entry the reconcile deleted, each on the release basis its call holds. */
  released: readonly ToolCallId[]
  /** The calls ahead of the waiter, or holding a slot, with an open `queue` task. */
  redrive: readonly ToolCallId[]
}>

/**
 * The queue maintenance entry of this ledger (SPEC 22). `reconcile` is asked for a call that
 * waits for its place; it answers for that call's FIFO key and never changes another call's
 * stage, and it writes no exclusion fence. Its replies: `denied` or `invalid` from the boundary
 * and the qualification of the action `recover` for the call; `invalid` (`call: unknown-call`)
 * when the waiter's own call is not admitted; an empty answer when its request is not available,
 * because such a call has no queue; `unavailable` when a read fails, or when the commit that
 * releases places has an unknown outcome (nothing is claimed; the waiter asks again later).
 */
export type ToolLedgerQueues<P> = Readonly<{
  reconcile(input: CallAccess<P>): Reply<QueueReconciliation>
}>

export type ToolDependencies<P, B extends ContentBlock, E> = Readonly<{
  facts: ToolLedgerFacts<P, B>
  commands: ToolCommands<P, B>
  admissions: ToolLedgerAdmissions<P>
  queues: ToolLedgerQueues<P>
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
  /** Mints the operation identity of every ordinary command. */
  operationIdentities: ToolOperationIdentities
  /** The trusted source that atomically establishes or recalls the original invocation association. */
  sourceIssuer: ToolInvocationSourceIssuer<P>
}>

/** Trusted recovery consumers can recover complete original facts by their exact evidence. */
export type ToolLedgerFacts<P, B extends ContentBlock> = Readonly<{
  read(
    input: CallAccess<P> & Readonly<{ basis: DurableEvidence }>,
  ): Reply<import('./ledger-store.ts').SavedFact<B>>
}>

/** Explicit ledger providers. A null content reader disables byte reads only. */
export type ToolLedgerPorts<P> = Readonly<{
  content: Pick<ToolContentReader<P>, 'read'> | null
  custody: Pick<ToolOutputCustody<P>, 'retainResult'>
  releaseInspection: Pick<ToolEnvironment<P, unknown>, 'inspectRelease'>
}>
