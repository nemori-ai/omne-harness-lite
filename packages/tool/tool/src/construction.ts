import type { JsonLimits, JsonRead } from '@omne-harness/json-text'
// The construction shapes of the Tool runtime factory and the ledger factory. They belong to the
// implementation, not to the contract: another implementation may take different dependencies
// and configuration.
import type { ContentBlock } from '@omne-harness/content-block'
import type {
  FixedToolRequest,
  DurableEvidence,
  Reply,
  ToolCallId,
  ToolCatalog,
  ToolState,
  ControlRecord,
  ToolOperationId,
  ToolPublishedSchema,
} from '@omne-harness/tool-contract'
import type { CallAccess, WriteContext } from '@omne-harness/tool-contract/provider'
import type { AccessVerdict } from './ledger-guards.ts'
import type { PendingCall } from './ledger-store.ts'
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
  ToolReads,
  ToolResourceResponses,
  ToolStartAuthority,
  ToolBodyPermitKey,
  ToolBodyStore,
  ToolInstantClock,
} from '@omne-harness/tool-contract/provider'

export type ToolOffloadingConfiguration = Readonly<{
  maxInlineUtf8Bytes: number
  maxRetentionMs: number
  maxBodyBytes: number
  previewUtf8Bytes: number
  /** k: the preview budget is at most the offloading threshold divided by k, rounded down. Absent means 8. */
  previewDivisor?: number
  maxPageBytes: number
  maxWriterMetadataBytes: number
  jsonDocument: JsonLimits
  jsonRecord: JsonLimits
  /** W: how long one write permit lasts on the issuer's clock. */
  permitMs: number
  /** ε: the largest clock difference between any two participants of the deployment. */
  clockSkewMs: number
  /** G: the time after settlement at which an orphaned body is due for reclaim. Must exceed W + 2ε. */
  orphanGraceMs: number
}>

export type ToolConfiguration = ToolAuthorLimits &
  Readonly<{
    processBatchBytes: number
    processBatchDelayMs: number
    observerBufferBytes: number
    /** The most bytes of whole content blocks on one result page (P08). */
    resultPageBytes: number
    offloading: ToolOffloadingConfiguration
    readResultArguments: JsonLimits
    reconciliationDelayMs: number
    /** How many times a ledger command re-reads and re-decides after a revision conflict. */
    ledgerCommitAttempts: number
    /**
     * The most unreleased calls one concurrency scope may hold (P02: a queue has a capacity, and a
     * new admission may be refused before it is committed). Distinct from the tool limit and the
     * scope budget a request fixes, which count held slots.
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
  | 'authorBufferBytes'
  | 'authorBufferItems'
  | 'resultPageBytes'
  | 'ledgerCommitAttempts'
  | 'queueCapacity'
  | 'offloading'
  | 'readResultArguments'
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
 * waits for its place; it answers for that call's queue key and never changes another call's
 * stage, and it writes no exclusion fence. Its replies: `denied` or `invalid` from the boundary
 * and the qualification of the action `recover` for the call; `invalid` (`call: unknown-call`)
 * when the waiter's own call is not admitted; an empty answer when its request is not available,
 * because such a call has no queue; `unavailable` when a read fails, or when the commit that
 * releases places has an unknown outcome (nothing is claimed; the waiter asks again later).
 */
export type ToolLedgerQueues<P> = Readonly<{
  reconcile(input: CallAccess<P>): Reply<QueueReconciliation>
  /**
   * Does the park duty `operation` of a suspended call (P02): the held entry gives up its slot
   * while the wait has not reached `responding`, and the duty closes. A call whose decision came
   * first keeps its slot; a duty that is already closed answers `parked: false`. Its replies:
   * `denied` or `invalid` from the boundary and the qualification of `recover`; `commit-unknown`
   * with the duty's operation when a commit has an unknown outcome (the duty stays and is asked
   * again); `unavailable` when a read fails.
   */
  park(
    input: CallAccess<P> & Readonly<{ operation: ToolOperationId }>,
  ): Reply<Readonly<{ parked: boolean }>>
  /**
   * 完成已收场调用的释放待办 `operation`（P02，Tool SPEC 第 22、32 条）：先读调用域的释放依据，
   * 队列域同一笔提交删除条目并写墓碑，调用域再删除该待办。没有依据时回复 `invalid`
   * （`call: no-release-basis`），待办保留；待办已关闭时回复 `released: false`。其余回复同 `park`。
   */
  release(
    input: CallAccess<P> & Readonly<{ operation: ToolOperationId }>,
  ): Reply<Readonly<{ released: boolean }>>
}>

/**
 * The settlement entry of this ledger for a step the store rejected for good (SPEC 23). `settle`
 * gives a call that never started (no start record) the minimal failure terminal: `failed`,
 * cause `runtime-lost`, diagnostic `ledger-store rejected: <reason>`, then releases its queue
 * place. The driver passes the operation `<admission>/ledger-rejected`; a resend recalls the
 * original receipt and finishes the release. A call with a start record answers `invalid`
 * (`call: has-start-record`), and a call in another phase answers `invalid` (`call: phase:<phase>`).
 */
export type ToolLedgerRejections<P> = Readonly<{
  settle(input: WriteContext & Readonly<{ principal: P; reason: string }>): Reply<ToolState>
}>

export type ToolDependencies<P, B extends ContentBlock, E> = Readonly<{
  /** The ledger's original-controller check before a pending stop is sent. */
  controls?: ToolLedgerControls<P>
  commands: ToolCommands<P, B>
  admissions: ToolLedgerAdmissions<P>
  queues: ToolLedgerQueues<P>
  rejections: ToolLedgerRejections<P>
  bindings: ToolBindings<P, E>
  environments: ToolEnvironment<P, E>
  decisions: ToolDecisionBridge<P>
  instances: ToolInstanceHost<P>
  clock: ToolClock
  resultPolicy: ResultPolicy<B>
  authority: ToolStartAuthority<P>
  resources: ToolResourceResponses<P>
  catalog: ToolCatalog<P>
  reads: ToolReads<P, B>
  children: ToolChildren<P>
  /** Mints the operation identity of every ordinary command. */
  operationIdentities: ToolOperationIdentities
  /** The trusted source that atomically establishes or recalls the original invocation association. */
  sourceIssuer: ToolInvocationSourceIssuer<P>
}>

/**
 * 账本的受信恢复扫描（契约 P09 recover，P01 scanPending）：跨租户、按键集分页列出有待推进工作的
 * 调用，`next` 是下一页的起点，`null` 表示扫完。它只给出调用身份，不读调用记录，也不判断资格，
 * 所以只有宿主在构造时取得它，不经契约服务发布。恢复者对每个调用仍以 `recover` 资格读原事实。
 * `limit` 是 1 到 1000 的整数。记录仓不能扫描时答复 `unsupported`，读不到时答复 `unavailable`。
 */
export type ToolLedgerRecovery = Readonly<{
  scan(
    input: Readonly<{ after: PendingCall | null; limit: number }>,
  ): Reply<Readonly<{ calls: readonly PendingCall[]; next: PendingCall | null }>>
}>

/** Reads pending original facts or settled final receipts by their exact evidence. */
export type ToolLedgerFacts<P, B extends ContentBlock> = Readonly<{
  read(
    input: CallAccess<P> & Readonly<{ basis: DurableEvidence }>,
  ): Reply<import('./ledger-store.ts').SavedFact<B>>
}>

/** Explicit ledger providers. A null content reader disables byte reads only. */
export type ToolLedgerPorts<P> = Readonly<{
  bodySchemas?: Readonly<{
    check(schema: ToolPublishedSchema, read: Extract<JsonRead, { kind: 'ok' }>): Reply<void>
  }>
  /**
   * Body custody (BodyLifecycle): the store holds immutable chunks under permits the ledger signs
   * with `permitKey`; `clock` is the ledger's own participant clock (issuer, settler and reader).
   */
  bodies?: Readonly<{
    store: ToolBodyStore
    permitKey: ToolBodyPermitKey
    clock: ToolInstantClock
  }>
  /** A trusted identity owner. Absence disables new controls and pending propagation. */
  controlSubjects?: ToolControlSubjects<P>
  content: Pick<ToolContentReader<P>, 'read'> | null
  releaseInspection: Pick<ToolEnvironment<P, unknown>, 'adoption' | 'inspectRelease'>
  /**
   * The decision owner of Ask waits (P06): `acceptDecision` resolves the reported decision through
   * it before the commit. Absent, `acceptDecision` answers `unavailable` (`tool-decisions`).
   */
  decisions?: Pick<ToolDecisionBridge<P>, 'resolve'>
}>

/** Durable controller references, issued and resolved by the trusted identity owner. */
export type ToolControlSubjects<P> = Readonly<{
  capture(input: CallAccess<P>): Reply<DurableEvidence>
  /** Compare stable subjects, including refreshed credentials, within the requested tenant. */
  matches(input: CallAccess<P> & Readonly<{ subject: DurableEvidence }>): Promise<AccessVerdict>
  /** Resolve the original subject and check its current control scope for this tenant/call. */
  qualify(
    input: Omit<CallAccess<P>, 'principal'> & Readonly<{ subject: DurableEvidence }>,
  ): Promise<AccessVerdict>
}>

export type ToolLedgerControls<P> = Readonly<{
  prepareDispatch(
    input: CallAccess<P> &
      Readonly<{
        control: ToolOperationId
        source: DurableEvidence
      }>,
  ): Reply<ControlRecord>
}>
