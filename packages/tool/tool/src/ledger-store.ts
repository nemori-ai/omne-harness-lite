// The ledger store port (G1): one domain read and one revision-conditioned atomic commit. The
// store keeps records by key inside a transaction domain and interprets none of them. A durable
// provider (#280) and the non-durable store of `./testing` implement the same port.
import type { ContentBlock } from '@omne-harness/content-block'
import type {
  Access,
  DeliveryState,
  ReleasedDelivery,
  DurableEvidence,
  Effect,
  FixedToolRequest,
  PreparationRecord,
  ToolCallId,
  ToolCommands,
  ToolExecutionRef,
  ToolOperationId,
  ToolRecovery,
  ToolResult,
  ToolResultVersion,
  ToolRevision,
  ToolStartRecord,
  ToolState,
  ToolTask,
  ToolTerminal,
} from '@omne-harness/tool-contract'

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
 * execution reference of the instance that recorded its start.
 */
export type CallRecord = Readonly<{
  tenant: TenantId
  call: ToolCallId
  admission: ToolOperationId
  request: FixedToolRequest
  initiator: ToolRecovery<never>['initiator']
  state: ToolState
  preparations: readonly PreparationRecord[]
  environment: ConfirmedEnvironment | null
  start: Extract<ToolStartRecord, { kind: 'start' }> | null
  startRejection: StartRejection | null
  execution: ToolExecutionRef | null
}>

/** The complete named result of one committed operation (P01 `committed.receipt`). */
export type OperationReceipt =
  | Readonly<{ kind: 'admit'; state: ToolState }>
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
  | Readonly<{ kind: 'record-start'; state: ToolState }>

export type OperationRecord = Readonly<{
  tenant: TenantId
  call: ToolCallId
  operation: ToolOperationId
  inputDigest: string
  revision: ToolRevision
  receipt: OperationReceipt
}>

/** One result version with its delivery relation. `settledBy` is the operation that made it. */
export type ResultRecord<B extends ContentBlock> = Readonly<{
  tenant: TenantId
  call: ToolCallId
  result: ToolResultVersion
  relation: 'original' | 'late'
  terminal: ToolTerminal
  actual: ToolTerminal | null
  effect: Effect
  value: ToolResult<B>
  delivery: DeliveryState
  source: DurableEvidence
  settledBy: ToolOperationId
}>

export type AccountRecord = Readonly<{
  tenant: TenantId
  call: ToolCallId
  start: ToolOperationId | null
  source: DurableEvidence
  event: string
  value: CallAccount
}>

/**
 * The exclusion fence of one negative answer (P01). A reader that found no record of `operation`
 * writes it at `revision`, the domain revision of the fence commit, so a command of that operation
 * which was in flight before the fence can tell that its negative answer was already given. The
 * commit of the operation deletes it.
 */
export type ExclusionRecord = Readonly<{ operation: ToolOperationId; revision: ToolRevision }>

/**
 * One call inside a queue domain (P02). `ordinal` is its persistent place in the FIFO, assigned
 * before the admit reply, or by `planPreparation` when that step failed at admission; `stage` is `preparing` until the environment is confirmed
 * and the call enqueued, `ready` while it waits for the head and a slot, `held` from the start
 * intent until the release; a released entry is deleted. `operation` is the operation that last
 * moved the entry, so a repeated step after a crash recognises its own transition, and a step of
 * another operation on an entry that is past it answers `conflict`. `limit` is
 * the concurrency the call fixed at admission, or null for no limit.
 */
export type QueueEntryRecord = Readonly<{
  call: ToolCallId
  ordinal: string
  stage: 'preparing' | 'ready' | 'held'
  operation: ToolOperationId
  limit: number | null
}>

/** The next ordinal of a queue domain. */
export type QueueCounterRecord = Readonly<{ next: string }>

/**
 * What a call domain holds that lets the queue domain release the call's place (P02: a place is
 * released on a proof, never on a logical end alone). The queue domain cannot read the call
 * domain, so the caller names the basis and the tombstone keeps it.
 */
export type ReleaseBasis =
  /** The start fence excluded the whole invocation: it never started and never will. */
  | Readonly<{ kind: 'pre-start-rejection'; exclusion: DurableEvidence }>
  /**
   * The execution physically ended, or was proven excluded (execution-facts increment). Declared so that the
   * release path has its one place for it; nothing in this increment builds it.
   */
  | Readonly<{ kind: 'physical-end'; proof: DurableEvidence }>

/**
 * The tombstone of a released call (P02): the queue domain never gives this call an entry again.
 * It is written in the same commit that deletes the entry, and a call that had no entry yet gets
 * it too, so a creation step that runs after the release finds it. It is never pruned in 0.0.x:
 * a time bound may reclaim it later under the compaction of the recovery increment, but never as a safety rule.
 */
export type QueueReleaseRecord = Readonly<{ call: ToolCallId; basis: ReleaseBasis }>

/** A record of a host provider. The ledger stores it by key and never reads its value. */
export type HostRecord = Readonly<{ key: string; value: unknown }>

export type LedgerRecord<B extends ContentBlock> =
  | Readonly<{ kind: 'call'; call: CallRecord }>
  | Readonly<{ kind: 'operation'; operation: OperationRecord }>
  | Readonly<{ kind: 'result'; result: ResultRecord<B> }>
  | Readonly<{ kind: 'account'; account: AccountRecord }>
  | Readonly<{ kind: 'task'; task: ToolTask }>
  | Readonly<{ kind: 'exclusion'; exclusion: ExclusionRecord }>
  | Readonly<{ kind: 'queue-entry'; entry: QueueEntryRecord }>
  | Readonly<{ kind: 'queue-counter'; counter: QueueCounterRecord }>
  | Readonly<{ kind: 'queue-release'; release: QueueReleaseRecord }>
  | Readonly<{ kind: 'host'; host: HostRecord }>

/** The unique key of a record inside its domain. A `put` with the same key replaces the record. */
export function recordKey<B extends ContentBlock>(record: LedgerRecord<B>): string {
  if (isQueueRecord(record)) return queueRecordKey(record)
  switch (record.kind) {
    case 'call':
      return 'call'
    case 'operation':
      return `operation:${record.operation.operation}`
    case 'result':
      return `result:${record.result.result}`
    case 'account':
      return `account:${record.account.event}`
    case 'task':
      return taskKey(record.task)
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

type QueueRecord<B extends ContentBlock> = Extract<
  LedgerRecord<B>,
  { kind: 'queue-entry' | 'queue-counter' | 'queue-release' }
>

function isQueueRecord<B extends ContentBlock>(record: LedgerRecord<B>): record is QueueRecord<B> {
  return (
    record.kind === 'queue-entry' ||
    record.kind === 'queue-counter' ||
    record.kind === 'queue-release'
  )
}

/** The key of a record of a queue domain. */
function queueRecordKey<B extends ContentBlock>(record: QueueRecord<B>): string {
  switch (record.kind) {
    case 'queue-entry':
      return queueEntryKey(record.entry.call)
    case 'queue-counter':
      return QUEUE_COUNTER_KEY
    case 'queue-release':
      return queueReleaseKey(record.release.call)
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

export function queueReleaseKey(call: ToolCallId): string {
  return `released:${call}`
}

export const QUEUE_COUNTER_KEY = 'counter'

export function hostKey(key: string): string {
  return `host:${key}`
}

/** A write by key. A `delete` of a key that holds no record is a no-op, not a failure. */
export type LedgerWrite<B extends ContentBlock> =
  | Readonly<{ kind: 'put'; record: LedgerRecord<B> }>
  | Readonly<{ kind: 'delete'; key: string }>

/**
 * A domain read. `complete` holds every record of the domain and its current revision, and it
 * includes every commit that returned `committed` before the read began. A domain that was never
 * committed has revision `0` and no records.
 */
export type LedgerRead<B extends ContentBlock> =
  | Readonly<{ kind: 'complete'; revision: ToolRevision; records: readonly LedgerRecord<B>[] }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export type LedgerCommitInput<B extends ContentBlock> = Readonly<{
  domain: LedgerDomain
  expected: ToolRevision
  revision: ToolRevision
  writes: readonly LedgerWrite<B>[]
}>

/**
 * The answer of a commit. `conflict` means the domain revision was not `expected` and nothing was
 * written. `unknown` means the store cannot tell whether the writes took effect; the caller
 * recognises the outcome by the operation it wrote. `unavailable` means nothing was attempted.
 */
export type LedgerCommit =
  | Readonly<{ kind: 'committed' }>
  | Readonly<{ kind: 'conflict'; current: ToolRevision }>
  | Readonly<{ kind: 'unknown'; diagnostic: string }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export interface ToolLedgerStore<B extends ContentBlock> {
  /** `none` is the store of `./testing`; a production assembly needs `durable`. */
  readonly durability: 'none' | 'durable'
  read(domain: LedgerDomain): Promise<LedgerRead<B>>
  /**
   * Atomic: all writes take effect together, or none does. Serialized with `read` per domain. A
   * committed commit sets the domain revision to `revision` whatever its write set holds: a set
   * with one exclusion record, or a set that changes no record, advances the revision the same
   * way as any other, because the ledger's exclusion fence depends on that advance. There is no
   * no-op shortcut.
   */
  commit(input: LedgerCommitInput<B>): Promise<LedgerCommit>
}
