import type { JsonLimits, JsonRead } from '@omne-harness/json-text'
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
  previewDivisor?: number
  maxPageBytes: number
  maxWriterMetadataBytes: number
  jsonDocument: JsonLimits
  jsonRecord: JsonLimits
  permitMs: number
  clockSkewMs: number
  orphanGraceMs: number
}>

export type ToolConfiguration = ToolAuthorLimits &
  Readonly<{
    processBatchBytes: number
    processBatchDelayMs: number
    observerBufferBytes: number
    resultPageBytes: number
    offloading: ToolOffloadingConfiguration
    readResultArguments: JsonLimits
    reconciliationDelayMs: number
    ledgerCommitAttempts: number
    queueCapacity: number
    driverStepsPerRun?: number
    driverRetryDelayMs?: number
  }>

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

export type ToolLedgerAdmissions<P> = Readonly<{
  admit(
    input: Mutation<P> & Readonly<{ request: FixedToolRequest }>,
  ): Reply<Readonly<{ state: ToolState; recovered: boolean }>>
}>

export type QueueReconciliation = Readonly<{
  released: readonly ToolCallId[]
  redrive: readonly ToolCallId[]
}>

export type ToolLedgerQueues<P> = Readonly<{
  reconcile(input: CallAccess<P>): Reply<QueueReconciliation>
  park(
    input: CallAccess<P> & Readonly<{ operation: ToolOperationId }>,
  ): Reply<Readonly<{ parked: boolean }>>
  release(
    input: CallAccess<P> & Readonly<{ operation: ToolOperationId }>,
  ): Reply<Readonly<{ released: boolean }>>
}>

export type ToolLedgerRejections<P> = Readonly<{
  settle(input: WriteContext & Readonly<{ principal: P; reason: string }>): Reply<ToolState>
}>

export type ToolCallLiveness = Readonly<{
  holds(call: PendingCall): boolean
  attach(call: PendingCall): Promise<boolean>
}>

export type ToolDependencies<P, B extends ContentBlock, E> = Readonly<{
  controls?: ToolLedgerControls<P>
  liveness?: ToolCallLiveness
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
  operationIdentities: ToolOperationIdentities
  sourceIssuer: ToolInvocationSourceIssuer<P>
}>

export type ToolLedgerRecovery = Readonly<{
  scan(
    input: Readonly<{ after: PendingCall | null; limit: number }>,
  ): Reply<Readonly<{ calls: readonly PendingCall[]; next: PendingCall | null }>>
}>

export type ToolLedgerFacts<P, B extends ContentBlock> = Readonly<{
  read(
    input: CallAccess<P> & Readonly<{ basis: DurableEvidence }>,
  ): Reply<import('./ledger-store.ts').SavedFact<B>>
}>

export type ToolLedgerPorts<P> = Readonly<{
  bodySchemas?: Readonly<{
    check(schema: ToolPublishedSchema, read: Extract<JsonRead, { kind: 'ok' }>): Reply<void>
  }>
  bodies?: Readonly<{
    store: ToolBodyStore
    permitKey: ToolBodyPermitKey
    clock: ToolInstantClock
  }>
  controlSubjects?: ToolControlSubjects<P>
  content: Pick<ToolContentReader<P>, 'read'> | null
  releaseInspection: Pick<ToolEnvironment<P, unknown>, 'adoption' | 'inspectRelease'>
  decisions?: Pick<ToolDecisionBridge<P>, 'resolve'>
}>

export type ToolControlSubjects<P> = Readonly<{
  capture(input: CallAccess<P>): Reply<DurableEvidence>
  matches(input: CallAccess<P> & Readonly<{ subject: DurableEvidence }>): Promise<AccessVerdict>
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
