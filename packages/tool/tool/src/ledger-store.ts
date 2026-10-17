// The ledger store port (G1): one domain read and one revision-conditioned atomic commit. The
// store keeps records by key inside a transaction domain and interprets none of them. A durable
// provider (#280) and the non-durable store of `./testing` implement the same port.
import type { ContentBlock } from '@omne-harness/content-block'
import type {
  Access,
  DeliveryState,
  DurableEvidence,
  Effect,
  FixedToolRequest,
  ToolCallId,
  ToolCommands,
  ToolOperationId,
  ToolResult,
  ToolResultVersion,
  ToolRevision,
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
 * domain (ticket 06) holds the FIFO order and the slots of one key.
 */
export type LedgerDomain =
  | Readonly<{ kind: 'call'; tenant: TenantId; call: ToolCallId }>
  | Readonly<{ kind: 'queue'; tenant: TenantId; key: string }>

/** The original call: its admission, the fixed request and the current authoritative state. */
export type CallRecord = Readonly<{
  tenant: TenantId
  call: ToolCallId
  admission: ToolOperationId
  request: FixedToolRequest
  state: ToolState
}>

/** The complete named result of one committed operation (P01 `committed.receipt`). */
export type OperationReceipt =
  | Readonly<{ kind: 'admit'; state: ToolState }>
  | Readonly<{ kind: 'release-delivery'; delivery: DeliveryState }>

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

export type LedgerRecord<B extends ContentBlock> =
  | Readonly<{ kind: 'call'; call: CallRecord }>
  | Readonly<{ kind: 'operation'; operation: OperationRecord }>
  | Readonly<{ kind: 'result'; result: ResultRecord<B> }>
  | Readonly<{ kind: 'account'; account: AccountRecord }>
  | Readonly<{ kind: 'task'; task: ToolTask }>

/** The unique key of a record inside its domain. A `put` with the same key replaces the record. */
export function recordKey<B extends ContentBlock>(record: LedgerRecord<B>): string {
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
    default: {
      const exhaustive: never = record
      return exhaustive
    }
  }
}

export function taskKey(task: Pick<ToolTask, 'kind' | 'operation'>): string {
  return `task:${task.kind}:${task.operation}`
}

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
  /** Atomic: all writes take effect together, or none does. Serialized with `read` per domain. */
  commit(input: LedgerCommitInput<B>): Promise<LedgerCommit>
}
