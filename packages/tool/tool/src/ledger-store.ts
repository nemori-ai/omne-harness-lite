import type { BodyEntryRecord } from './ledger-body-records.ts'
import type { ResultPolicyRecord } from './ledger-result-policy.ts'
import type { ResultPreparationRecord } from './ledger-result-preparation.ts'
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

export type TenantId = Access<unknown>['tenant']
export type CallAccount = Parameters<
  ToolCommands<unknown, ContentBlock>['recordAccount']
>[0]['value']

export type LedgerDomain =
  | Readonly<{ kind: 'call'; tenant: TenantId; call: ToolCallId }>
  | Readonly<{ kind: 'queue'; tenant: TenantId; key: string }>
  | Readonly<{ kind: 'host'; tenant: TenantId; key: string }>

export type StartRejection = Readonly<{ reason: string; exclusion: DurableEvidence }>

export type ConfirmedEnvironment = Readonly<{
  preparation: ToolOperationId
  resources: DurableEvidence
}>

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
  | Readonly<{ kind: 'settle-lost'; state: ToolState }>
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
export type StoredWaitFact = Omit<Extract<ToolExecutionFact, { kind: 'wait' }>, 'request'>
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

export function factKey(start: ToolStartRecord, owner: string, identity?: string): string {
  return JSON.stringify(
    identity === undefined ? [start.operation, owner] : [start.operation, owner, identity],
  )
}

export type ExclusionRecord = Readonly<{ operation: ToolOperationId; revision: ToolRevision }>

export type SuspensionLedgerRecord = Readonly<{
  suspension: SuspensionRecord
  checkpoint: Checkpoint | null
}>

export type WaitRequestRecord = Readonly<{ wait: ToolWaitId; request: string }>

export type CheckpointStateRecord = Readonly<{ payload: DurableEvidence; state: string }>

export type WaitLedgerRecord = Readonly<{
  record: WaitRecord
  fact: DurableEvidence
  suspension: ToolOperationId
}>

export type QueueEntryRecord = Readonly<{
  call: ToolCallId
  ordinal: string
  stage: 'preparing' | 'ready' | 'held' | 'parked'
  operation: ToolOperationId
  tool: string
  limit: number | null
  scopeBudget: number | null
}>

export type QueueCounterRecord = Readonly<{ next: string }>

export type ReleaseBasis =
  | Readonly<{ kind: 'pre-start-rejection'; exclusion: DurableEvidence }>
  | Readonly<{ kind: 'physical-end'; proof: DurableEvidence }>
  | Readonly<{ kind: 'ledger-rejected'; result: DurableEvidence }>
  | Readonly<{
      kind: 'suspended-exclusion'
      checkpoint: DurableEvidence
      exclusion: DurableEvidence
    }>
  | Readonly<{ kind: 'lost-continuity'; continuity: DurableEvidence }>

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

export const CALL_RECORD_KEY = 'call'

export const WAIT_REQUEST_KEY = 'wait-request'

export const CHECKPOINT_STATE_KEY = 'checkpoint-state'

export const CALL_DUE_KEY = 'call'

export function hostKey(key: string): string {
  return `host:${key}`
}

export type LedgerWrite =
  | Readonly<{ kind: 'drop' }>
  | Readonly<{ kind: 'put'; record: LedgerRecord }>
  | Readonly<{ kind: 'delete'; key: string }>
  | Readonly<{ kind: 'schedule'; key: string; dueAt: ToolInstant }>
  | Readonly<{ kind: 'unschedule'; key: string }>

export type DueEntry = Readonly<{ domain: LedgerDomain; key: string; dueAt: ToolInstant }>

export type LedgerDueRead =
  | Readonly<{ kind: 'complete'; entries: readonly DueEntry[] }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export type LedgerRead =
  | Readonly<{ kind: 'complete'; revision: ToolRevision; records: readonly LedgerRecord[] }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export type LedgerRecordRead =
  | Readonly<{ kind: 'complete'; revision: ToolRevision; record: LedgerRecord | null }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export type LedgerAssertion = Readonly<{ domain: LedgerDomain; revision: ToolRevision }>

export type LedgerCommitInput = Readonly<{
  domain: LedgerDomain
  expected: ToolRevision
  revision: ToolRevision
  writes: readonly LedgerWrite[]
  asserts?: readonly LedgerAssertion[]
  pending?: boolean
}>

export type PendingCall = Readonly<{ tenant: TenantId; call: ToolCallId }>

export type LedgerPendingScanInput = Readonly<{
  tenant: TenantId | null
  after: PendingCall | null
  limit: number
}>

export type LedgerPendingScan =
  | Readonly<{ kind: 'page'; calls: readonly PendingCall[]; more: boolean }>
  | Readonly<{ kind: 'unsupported'; reason: string }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export type LedgerCommit =
  | Readonly<{ kind: 'committed' }>
  | Readonly<{ kind: 'conflict'; current: ToolRevision }>
  | Readonly<{ kind: 'unknown'; diagnostic: string }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>
  | Readonly<{ kind: 'rejected'; reason: string }>

export interface ToolLedgerStore {
  readonly durability: 'none' | 'durable'
  read(domain: LedgerDomain): Promise<LedgerRead>
  readRecord(domain: LedgerDomain, key: string): Promise<LedgerRecordRead>
  commit(input: LedgerCommitInput): Promise<LedgerCommit>
  due(tenant: TenantId, now: ToolInstant, limit: number): Promise<LedgerDueRead>
  scanPending(input: LedgerPendingScanInput): Promise<LedgerPendingScan>
}
