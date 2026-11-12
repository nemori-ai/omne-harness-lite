import type { BodyEntryRecord } from './ledger-body-records.ts'
import type { ResultPolicyRecord } from './ledger-result-policy.ts'
import type { ResultPreparationRecord } from './ledger-result-preparation.ts'
// The ledger store port (G1): one domain read and one revision-conditioned atomic commit. The
// store keeps records by key inside a transaction domain and interprets none of them. A durable
// provider (#280) and the non-durable store of `./testing` implement the same port.
import type { ContentBlock } from '@omne-harness/content-block'
import type { ResultValue } from './ledger-result-material.ts'
import type {
  Access,
  ControlReceipt,
  ControlRecord,
  DeliveryState,
  ReleasedDelivery,
  DurableEvidence,
  Effect,
  FixedToolRequest,
  ProcessBlock,
  ToolCallId,
  ToolExecutionRef,
  ToolOperationId,
  ToolResultVersion,
  ToolRevision,
  ToolStartRecord,
  ToolState,
  ToolWaitId,
  ToolTerminal,
  WaitRecord,
  WaitState,
} from '@omne-harness/tool-contract'
import type {
  Checkpoint,
  ToolInstant,
  ReleaseRecord,
  ReleaseProgress,
  FactReceipt,
  FactProgress,
  SuspensionRecord,
  ToolExecutionFact,
  PreparationRecord,
  ToolCommands,
  ToolRecovery,
  ToolTask,
  ToolFinalEnvelope,
  ToolPlannedFinal,
  ToolCanonicalFingerprint,
} from '@omne-harness/tool-contract/provider'

/** The tenant identity as the contract types it; the ledger does not import legal-identity. */
export type TenantId = Access<unknown>['tenant']
/** The account record as the contract types it; the ledger does not import call-account. */
export type CallAccount = Parameters<
  ToolCommands<unknown, ContentBlock>['recordAccount']
>[0]['value']

/**
 * A transaction domain. The `call` domain holds every record of one original call. The `queue`
 * domain holds the FIFO order and the slots of one key. The `host` domain holds the durable
 * records of a host provider under a key of its own, such as the start acceptance ledger of
 * `tool-host-local`; the ledger of this package never reads it.
 */
export type LedgerDomain =
  | Readonly<{ kind: 'call'; tenant: TenantId; call: ToolCallId }>
  | Readonly<{ kind: 'queue'; tenant: TenantId; key: string }>
  | Readonly<{ kind: 'host'; tenant: TenantId; key: string }>

/** A first start that the start fence rejected for good (P04): the call never starts again. */
export type StartRejection = Readonly<{ reason: string; exclusion: DurableEvidence }>

/** The environment the provider confirmed for the call (P03 `prepared`). */
export type ConfirmedEnvironment = Readonly<{
  preparation: ToolOperationId
  resources: DurableEvidence
}>

/**
 * The original call: its admission, the fixed request, who initiated it, the current
 * authoritative state, and the facts of its way to a start: the preparations it planned, the
 * environment it confirmed, the start record it holds, the rejection that closed it, and the
 * execution reference of the instance that recorded its start. `start` is the current start
 * record: the first start, or the resume of the segment after the latest committed checkpoint
 * (P07). The records before it are found through the suspensions, each of which keeps its start.
 */
export type CallRecord = Readonly<{
  tenant: TenantId
  call: ToolCallId
  admission: ToolOperationId
  request: FixedToolRequest
  initiator: ToolRecovery['initiator']
  state: ToolState
  preparations: readonly PreparationRecord[]
  environment: ConfirmedEnvironment | null
  start: ToolStartRecord | null
  startRejection: StartRejection | null
  execution: ToolExecutionRef | null
}>

/** The complete named result of one committed operation (P01 `committed.receipt`). */
export type OperationReceipt =
  | Readonly<{ kind: 'prepare-result'; basis: DurableEvidence }>
  | Readonly<{ kind: 'admit'; state: ToolState }>
  | Readonly<{ kind: 'control'; control: ControlReceipt; subject?: DurableEvidence }>
  | Readonly<{ kind: 'record-control'; control: ControlRecord }>
  | Readonly<{ kind: 'release-delivery'; delivery: ReleasedDelivery }>
  | Readonly<{ kind: 'plan-preparation'; preparation: PreparationRecord }>
  | Readonly<{ kind: 'prepared'; state: ToolState }>
  | Readonly<{ kind: 'enqueue'; state: ToolState }>
  | Readonly<{
      kind: 'prepare-start'
      state: ToolState
      start: Extract<ToolStartRecord, { kind: 'start' }>
    }>
  | Readonly<{ kind: 'reject-pending'; state: ToolState }>
  | Readonly<{ kind: 'ledger-rejected'; state: ToolState }>
  | Readonly<{ kind: 'record-start'; state: ToolState }>
  | Readonly<{ kind: 'preserve-result'; state: ToolState }>
  | Readonly<{ kind: 'plan-release'; release: ReleaseRecord }>
  | Readonly<{ kind: 'record-release' | 'record-task'; evidence: DurableEvidence }>
  | Readonly<{ kind: 'fact-acknowledgement'; progress: FactProgress }>
  | Readonly<{ kind: 'plan-suspension'; suspension: SuspensionRecord }>
  | Readonly<{ kind: 'suspend'; state: ToolState }>
  | Readonly<{ kind: 'attach-registration'; wait: WaitRecord }>
  | Readonly<{ kind: 'accept-decision'; wait: WaitState }>
  | Readonly<{
      kind: 'prepare-resume'
      state: ToolState
      start: Extract<ToolStartRecord, { kind: 'resume' }>
    }>
  | Readonly<{ kind: 'close-wait'; state: ToolState }>

export type OperationRecord = Readonly<{
  tenant: TenantId
  call: ToolCallId
  operation: ToolOperationId
  inputDigest: string
  revision: ToolRevision
  receipt: OperationReceipt
}>

export type CleanupDuty =
  | Readonly<{ kind: 'planned'; operation: ToolOperationId }>
  | Readonly<{
      kind: 'awaiting-independent-custody'
      preparation: ToolOperationId
      diagnostic: string
    }>

export type ResultCustody =
  | Readonly<{ kind: 'synthetic' }>
  | Readonly<{
      kind: 'execution'
      final: DurableEvidence
      finalValue: ToolCanonicalFingerprint
      materialized: DurableEvidence
      cleanup: CleanupDuty
    }>

export type EnvironmentReleaseRecord = Readonly<{
  release: ReleaseRecord
  progress: ReleaseProgress
}>

/** One result version with its delivery relation. `settledBy` is the operation that made it. */
export type ResultRecord = Readonly<{
  tenant: TenantId
  call: ToolCallId
  result: ToolResultVersion
  relation: 'original' | 'late'
  terminal: ToolTerminal
  actual: ToolTerminal | null
  effect: Effect
  value: ResultValue
  delivery: DeliveryState
  source: DurableEvidence
  settledBy: ToolOperationId
  custody: ResultCustody
}>

export type AccountRecord = Readonly<{
  tenant: TenantId
  call: ToolCallId
  start: ToolOperationId | null
  source: DurableEvidence
  event: string
  value: CallAccount
}>

type SettledFinal = Pick<ToolPlannedFinal, 'terminal' | 'effect'> &
  Readonly<{
    kind: 'settled-final'
    result: ToolResultVersion
    settlement: DurableEvidence
  }>

/** Recovery returns an exact pending final or its committed settlement receipt. */
export type SavedFact<B extends ContentBlock> = Readonly<{
  start: ToolStartRecord
  source: DurableEvidence
  event: string
  fact:
    | Exclude<ToolExecutionFact, { kind: 'final' | 'wait' }>
    | StoredWaitFact
    | ToolFinalEnvelope<B>
    | SettledFinal
  evidence: DurableEvidence
}>
/**
 * The wait fact as the record keeps it: the intent, whose `request` evidence binds the request
 * original. The original itself is the one `wait-request` record of the call.
 */
export type StoredWaitFact = Omit<Extract<ToolExecutionFact, { kind: 'wait' }>, 'request'>
/** The planned final stays in the record; its payload says whether a result committed it. */
export type StoredFinalFact = ToolPlannedFinal &
  Readonly<{
    payload:
      | Readonly<{ kind: 'pending' }>
      | Readonly<{ kind: 'settled'; result: ToolResultVersion; settlement: DurableEvidence }>
  }>
export type StoredExecutionFact =
  | Exclude<ToolExecutionFact, { kind: 'final' | 'wait' }>
  | StoredWaitFact
  | StoredFinalFact

export type FactEventRecord = Omit<SavedFact<ContentBlock>, 'fact'> &
  Readonly<{
    fact: StoredExecutionFact
    value: ToolCanonicalFingerprint
    tenant: TenantId
    call: ToolCallId
    key: string
  }>
export type FactBatchRecord = Readonly<{
  value: ToolCanonicalFingerprint
  tenant: TenantId
  call: ToolCallId
  start: ToolStartRecord
  source: DurableEvidence
  batch: string
  after: string | null
  cursor: string
  events: readonly string[]
  receipt: FactReceipt
  acknowledgement:
    | Readonly<{ kind: 'pending' }>
    | Readonly<{ kind: 'confirmed'; sourceReceipt: DurableEvidence }>
}>
export type FactStreamRecord = Readonly<{
  tenant: TenantId
  call: ToolCallId
  start: ToolStartRecord
  source: DurableEvidence
  cursor: string
}>
export type ProcessRecord = Readonly<{
  tenant: TenantId
  call: ToolCallId
  start: ToolStartRecord
  block: ProcessBlock
}>

/** Canonical tuple identities never interpret separators inside provider text. */
export function factKey(start: ToolStartRecord, owner: string, identity?: string): string {
  return JSON.stringify(
    identity === undefined ? [start.operation, owner] : [start.operation, owner, identity],
  )
}

/**
 * The exclusion fence of one negative answer (P01). A reader that found no record of `operation`
 * writes it at `revision`, the domain revision of the fence commit, so a command of that operation
 * which was in flight before the fence can tell that its negative answer was already given. The
 * commit of the operation deletes it.
 */
export type ExclusionRecord = Readonly<{ operation: ToolOperationId; revision: ToolRevision }>

/**
 * The suspension of one segment of a checkpointed call (P07): planned with its start and checkpoint
 * schema, then committed with the checkpoint the binding proved. `checkpoint` is null until
 * `suspend` committed.
 */
export type SuspensionLedgerRecord = Readonly<{
  suspension: SuspensionRecord
  checkpoint: Checkpoint | null
}>

/**
 * The request original of the last Ask wait that the call accepted, as JSON text (P06). A call
 * holds one: the wait fact of a later segment replaces it, and the commit that settles the call
 * deletes it.
 */
export type WaitRequestRecord = Readonly<{ wait: ToolWaitId; request: string }>

/**
 * The state of the last committed checkpoint of the call as base64 text (P07). `payload` is the
 * `Checkpoint.payload` that binds its digest. A call holds one: the next checkpoint commit
 * replaces it, and the commit that settles the call deletes it. A resume does not delete it, so a
 * resume segment that is lost runs again from the same state.
 */
export type CheckpointStateRecord = Readonly<{ payload: DurableEvidence; state: string }>

/**
 * One wait of a call (P06), keyed by its wait identity, which a call never uses twice. `fact` is
 * the saved wait fact that the segment ended with, and `suspension` the suspension that opened it.
 */
export type WaitLedgerRecord = Readonly<{
  record: WaitRecord
  fact: DurableEvidence
  suspension: ToolOperationId
}>

/**
 * One call inside the queue domain of its concurrency scope (P02). `ordinal` is its persistent
 * place in the FIFO of the scope, assigned before the admit reply, or by `planPreparation` when
 * that step failed at admission; `stage` is `preparing` until the environment is confirmed and the
 * call enqueued, `ready` while it waits for the head and a slot, `held` from the start intent
 * until the release or the park; `parked` while a checkpointed call waits for a decision: it holds
 * no slot, and it still counts toward `queueCapacity`. A released entry is deleted. `operation` is
 * the operation that last moved the entry, so a repeated step after a crash recognises its own transition, and a step of another
 * operation on an entry that is past it answers `conflict`. The other fields are fixed at
 * admission: `tool` is the tool's asset name, without the implementation version; `limit` is the
 * most held slots of that tool in the scope (`limits.concurrency`), and `scopeBudget` the most held
 * slots of all tools in the scope (`limits.scopeBudget`); null is no limit.
 */
export type QueueEntryRecord = Readonly<{
  call: ToolCallId
  ordinal: string
  stage: 'preparing' | 'ready' | 'held' | 'parked'
  operation: ToolOperationId
  tool: string
  limit: number | null
  scopeBudget: number | null
}>

/** The next ordinal of a queue domain. */
export type QueueCounterRecord = Readonly<{ next: string }>

/**
 * What a call domain holds that lets the queue domain release the call's place (P02: a place is
 * released on a proof, never on a logical end alone). It is a fact of the call and stays in the
 * call domain; the queue domain never records it.
 */
export type ReleaseBasis =
  /** The start fence excluded the whole invocation: it never started and never will. */
  | Readonly<{ kind: 'pre-start-rejection'; exclusion: DurableEvidence }>
  /**
   * The original saved final proves that the execution physically ended. The call domain also
   * holds the confirmed result custody before this basis reaches the queue.
   */
  | Readonly<{ kind: 'physical-end'; proof: DurableEvidence }>
  /**
   * The store rejected a step of a call that never started, and the call settled with the minimal
   * failure terminal (SPEC 23). `result` is the evidence of that terminal's result: no start record
   * exists, so no execution can take the place.
   */
  | Readonly<{ kind: 'ledger-rejected'; result: DurableEvidence }>
  /**
   * The call settled while it was suspended: the committed checkpoint holds, and its exclusion
   * proves that the execution which suspended does not go on.
   */
  | Readonly<{
      kind: 'suspended-exclusion'
      checkpoint: DurableEvidence
      exclusion: DurableEvidence
    }>

/** A record of a host provider. The ledger stores it by key and never reads its value. */
export type HostRecord = Readonly<{ key: string; value: unknown }>

export type LedgerRecord =
  | Readonly<{ kind: 'body-entry'; body: BodyEntryRecord }>
  | Readonly<{ kind: 'result-policy'; policy: ResultPolicyRecord }>
  | Readonly<{ kind: 'result-preparation'; preparation: ResultPreparationRecord }>
  | Readonly<{ kind: 'call'; call: CallRecord }>
  | Readonly<{ kind: 'operation'; operation: OperationRecord }>
  | Readonly<{ kind: 'result'; result: ResultRecord }>
  | Readonly<{ kind: 'account'; account: AccountRecord }>
  | Readonly<{ kind: 'environment-release'; environmentRelease: EnvironmentReleaseRecord }>
  | Readonly<{ kind: 'task'; task: ToolTask }>
  | Readonly<{ kind: 'fact-event'; fact: FactEventRecord }>
  | Readonly<{ kind: 'fact-batch'; batch: FactBatchRecord }>
  | Readonly<{ kind: 'fact-stream'; stream: FactStreamRecord }>
  | Readonly<{ kind: 'process'; process: ProcessRecord }>
  | Readonly<{ kind: 'suspension'; suspension: SuspensionLedgerRecord }>
  | Readonly<{ kind: 'wait'; wait: WaitLedgerRecord }>
  | Readonly<{ kind: 'wait-request'; waitRequest: WaitRequestRecord }>
  | Readonly<{ kind: 'checkpoint-state'; checkpointState: CheckpointStateRecord }>
  | Readonly<{ kind: 'exclusion'; exclusion: ExclusionRecord }>
  | Readonly<{ kind: 'queue-entry'; entry: QueueEntryRecord }>
  | Readonly<{ kind: 'queue-counter'; counter: QueueCounterRecord }>
  | Readonly<{ kind: 'host'; host: HostRecord }>

/** The unique key of a record inside its domain. A `put` with the same key replaces the record. */
export function recordKey(record: LedgerRecord): string {
  if (isQueueRecord(record)) return queueRecordKey(record)
  switch (record.kind) {
    case 'body-entry':
      return `body:${record.body.bodyId}`
    case 'result-policy':
      return `result-policy:${record.policy.operation}`
    case 'result-preparation':
      return `result-preparation:${record.preparation.id}`
    case 'call':
      return CALL_RECORD_KEY
    case 'operation':
      return `operation:${record.operation.operation}`
    case 'result':
      return `result:${record.result.result}`
    case 'environment-release':
      return `environment-release:${record.environmentRelease.release.preparation}`
    case 'account':
      return `account:${record.account.event}`
    case 'task':
      return taskKey(record.task)
    case 'fact-event':
      return `fact-event:${record.fact.key}`
    case 'fact-batch':
      return `fact-batch:${factKey(record.batch.start, record.batch.source.owner, record.batch.batch)}`
    case 'fact-stream':
      return `fact-stream:${factKey(record.stream.start, record.stream.source.owner)}`
    case 'process':
      return `process:${JSON.stringify([record.process.start.operation, record.process.block.index])}`
    case 'suspension':
      return `suspension:${record.suspension.suspension.operation}`
    case 'wait':
      return `wait:${record.wait.record.intent.wait}`
    case 'wait-request':
      return WAIT_REQUEST_KEY
    case 'checkpoint-state':
      return CHECKPOINT_STATE_KEY
    case 'exclusion':
      return exclusionKey(record.exclusion.operation)
    case 'host':
      return hostKey(record.host.key)
    default: {
      const exhaustive: never = record
      return exhaustive
    }
  }
}

type QueueRecord = Extract<LedgerRecord, { kind: 'queue-entry' | 'queue-counter' }>

function isQueueRecord(record: LedgerRecord): record is QueueRecord {
  return record.kind === 'queue-entry' || record.kind === 'queue-counter'
}

/** The key of a record of a queue domain. */
function queueRecordKey(record: QueueRecord): string {
  switch (record.kind) {
    case 'queue-entry':
      return queueEntryKey(record.entry.call)
    case 'queue-counter':
      return QUEUE_COUNTER_KEY
    default: {
      const exhaustive: never = record
      return exhaustive
    }
  }
}

export function taskKey(task: Pick<ToolTask, 'kind' | 'operation'>): string {
  return `task:${task.kind}:${task.operation}`
}

export function exclusionKey(operation: ToolOperationId): string {
  return `exclusion:${operation}`
}

export function queueEntryKey(call: ToolCallId): string {
  return `entry:${call}`
}

export const QUEUE_COUNTER_KEY = 'counter'

/** The key of the one `call` record of a call domain, for a read of the call alone. */
export const CALL_RECORD_KEY = 'call'

/** The key of the one request original a call domain holds: a later wait fact replaces it. */
export const WAIT_REQUEST_KEY = 'wait-request'

/** The key of the one checkpoint state a call domain holds: a later checkpoint replaces it. */
export const CHECKPOINT_STATE_KEY = 'checkpoint-state'

/**
 * The key of the due entry of a call domain itself: the instant after which the sweep may drop
 * the domain (CallLifecycle `due`). The bodies of the domain have their own entries, under keys
 * that sort before this one: `due` answers by instant and then by key, so at one instant the
 * sweep reclaims the bodies before it reaches the domain.
 */
export const CALL_DUE_KEY = 'call'

export function hostKey(key: string): string {
  return `host:${key}`
}

/**
 * A write by key. A `delete` of a key that holds no record is a no-op, not a failure. `schedule`
 * and `unschedule` write the due index of the tenant under the written domain and `key`: a
 * `schedule` of a scheduled key replaces its instant, an `unschedule` of an unscheduled key is a
 * no-op. They take effect with the rest of the commit, or not at all.
 *
 * `drop` removes the whole domain: every record and every due entry of it. It is the only write of
 * its commit, and the commit names the initial revision as `revision`, so the domain reads as one
 * that was never committed. The store answers `rejected` to a `drop` with another write or with
 * another `revision`. The condition on `expected` is that of any commit.
 */
export type LedgerWrite =
  | Readonly<{ kind: 'drop' }>
  | Readonly<{ kind: 'put'; record: LedgerRecord }>
  | Readonly<{ kind: 'delete'; key: string }>
  | Readonly<{ kind: 'schedule'; key: string; dueAt: ToolInstant }>
  | Readonly<{ kind: 'unschedule'; key: string }>

/** One entry of the due index: the domain that scheduled it, its key and its instant. */
export type DueEntry = Readonly<{ domain: LedgerDomain; key: string; dueAt: ToolInstant }>

/**
 * The due entries of a tenant with `dueAt <= now`, oldest first, then by key, at most `limit`.
 * It includes every commit that returned `committed` before the read began.
 */
export type LedgerDueRead =
  | Readonly<{ kind: 'complete'; entries: readonly DueEntry[] }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

/**
 * A domain read. `complete` holds every record of the domain and its revision, and it includes
 * every commit that returned `committed` through the same provider before the read began. A
 * commit that another process wrote to the same storage may be missing for a bounded time that
 * the provider states. A domain that was never committed has revision `0` and no records; the
 * answer "no records", like `record: null` of `readRecord`, is always the content of the storage
 * at the read (SPEC「记录仓读取的新鲜度」).
 */
export type LedgerRead =
  | Readonly<{ kind: 'complete'; revision: ToolRevision; records: readonly LedgerRecord[] }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

/**
 * One record and the domain revision from the same snapshot as `read`.
 * `null` means the key is absent. This result never represents the complete domain.
 */
export type LedgerRecordRead =
  | Readonly<{ kind: 'complete'; revision: ToolRevision; record: LedgerRecord | null }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

/**
 * A read-set assertion of a commit: another domain of the same tenant whose current revision must
 * still be `revision` when the commit is applied. It writes nothing to that domain and does not
 * advance its revision. A caller that decided on a snapshot of a domain it does not write asserts
 * the revision it read, so the decision and the write linearize with the commits of that domain.
 */
export type LedgerAssertion = Readonly<{ domain: LedgerDomain; revision: ToolRevision }>

export type LedgerCommitInput = Readonly<{
  domain: LedgerDomain
  expected: ToolRevision
  revision: ToolRevision
  writes: readonly LedgerWrite[]
  /**
   * Domains of the tenant of `domain` whose revision must hold at the commit. An assertion on a
   * domain of another tenant is a defect of the caller: the store answers `unavailable` and
   * attempts nothing. The written domain itself is conditioned by `expected`, not listed here.
   */
  asserts?: readonly LedgerAssertion[]
  /**
   * 调用域的待办标记：这笔提交生效后，这个调用是否还有待推进的工作。只用于 `call` 域。
   * 记录仓把标记与 `writes` 放进同一笔原子提交：`true` 写标记，`false` 删标记，缺省不动标记。
   * 没有生效的提交（`conflict`、`unavailable`，或没有落地的 `unknown`）也不改变标记。
   * 本包的账本在每笔调用域提交里都给出这个值。
   */
  pending?: boolean
}>

/** 一个有待推进工作的调用：它的租户与调用身份。 */
export type PendingCall = Readonly<{ tenant: TenantId; call: ToolCallId }>

/**
 * 待办标记的一次按键集分页扫描。`tenant` 为 `null` 时跨租户扫描，否则只扫这个租户。
 * `after` 是上一页的最后一个调用，本页从它之后开始；`null` 从头开始。`limit` 是正整数。
 */
export type LedgerPendingScanInput = Readonly<{
  tenant: TenantId | null
  after: PendingCall | null
  limit: number
}>

/**
 * 扫描的答复。`page` 按记录仓自己的全序（先租户，再调用）列出最多 `limit` 个带标记的调用。
 * `more` 为 `true` 表示最后一个调用之后可能还有标记。扫描只读标记，不读调用记录。
 * `unsupported` 表示这个记录仓不能做这种扫描（例如没有租户目录，不能跨租户列出），
 * 重试不会改变答复。`unavailable` 表示这次没有读到，可以重试。
 */
export type LedgerPendingScan =
  | Readonly<{ kind: 'page'; calls: readonly PendingCall[]; more: boolean }>
  | Readonly<{ kind: 'unsupported'; reason: string }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

/**
 * The answer of a commit. `conflict` means the domain revision was not `expected`, or one of the
 * `asserts` did not hold, and nothing was written; `current` is the revision of the written
 * domain. `unknown` means the store cannot tell whether the writes took effect; the caller
 * recognises the outcome by the operation it wrote. `unavailable` means nothing was written and
 * the store cannot take the commit at this moment; the same commit may be sent again later.
 * `rejected` means nothing was written and the same commit is refused whenever it is sent (for
 * example a write set over the store's command limit, or an assertion on another tenant's
 * domain); `reason` is the store's reason.
 */
export type LedgerCommit =
  | Readonly<{ kind: 'committed' }>
  | Readonly<{ kind: 'conflict'; current: ToolRevision }>
  | Readonly<{ kind: 'unknown'; diagnostic: string }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>
  | Readonly<{ kind: 'rejected'; reason: string }>

export interface ToolLedgerStore {
  /** `none` is the store of `./testing`; a production assembly needs `durable`. */
  readonly durability: 'none' | 'durable'
  read(domain: LedgerDomain): Promise<LedgerRead>
  /** Reads only `key`, with the domain revision and ordering guarantees of `read`. */
  readRecord(domain: LedgerDomain, key: string): Promise<LedgerRecordRead>
  /**
   * Atomic: all writes take effect together, or none does. Serialized with both reads per domain. A
   * committed commit sets the domain revision to `revision` whatever its write set holds: a set
   * with one exclusion record, or a set that changes no record, advances the revision the same
   * way as any other, because the ledger's exclusion fence depends on that advance. There is no
   * no-op shortcut. The revision check of `domain` and every assertion of `asserts` are evaluated
   * in the same serialization as the writes: no commit of an asserted domain can land between the
   * evaluation and the write.
   */
  commit(input: LedgerCommitInput): Promise<LedgerCommit>
  /** The due index of one tenant: the only schedule of reclaim (model `due`). */
  due(tenant: TenantId, now: ToolInstant, limit: number): Promise<LedgerDueRead>
  /**
   * 按待办标记分页列出有待推进工作的调用（契约 P01：通知丢失由 scanPending 补偿）。
   * 记录仓按索引读标记，不做全表扫描，也不读调用记录正文。提交返回 `committed`
   * 之后开始的扫描能看到这笔提交写下或删掉的标记。
   */
  scanPending(input: LedgerPendingScanInput): Promise<LedgerPendingScan>
}
