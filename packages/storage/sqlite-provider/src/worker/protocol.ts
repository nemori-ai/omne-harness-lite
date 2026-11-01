// Messages between the control side and one write Worker (one Worker per domain file). The Worker
// loads no Cordis. Replies carry plain data only, so they cross the structured clone boundary.
import type {
  CommitRequestV2,
  ReceiptV2,
  SqlIdentity,
  SqlMaterialCatalog,
  StorageScope,
} from '@omne-harness/sql-contract'

/** Static data that the Worker gets at start (workerData). */
export type WorkerEnv = Readonly<{
  file: string
  /** The transaction domain that the file path stands for (SPEC 5.1 item 3). */
  domain: string
  catalog: SqlMaterialCatalog
  lockWaitMs: number
  walAutocheckpointPages: number
  journalSizeLimitBytes: number
  maxResponseBytes: number
  maxOperationResponseBytes: number
  maxDiagnosticBytes: number
  checkpointIntervalMs: number
  checkpointWalBytes: number
  walReadPauseBytes: number
  walWriteStopBytes: number
  /**
   * One Int32 shared with the control side. The control side stores 1 when the provider closes. The
   * Worker reads it before it starts a request, and confirms by reply what it did not start
   * (SPEC 13.3 step 2). The flag does not depend on when a message reaches the Worker.
   */
  closingFlag: SharedArrayBuffer
  /** Group commit limits (SPEC 7.3). */
  groupMaxOperations: number
  groupCollectMs: number
  groupMaxInputBytes: number
  groupMaxResponseReservationBytes: number
  groupMaxExecutionSliceMs: number
  /** The Worker generation of this start. Every reply carries it (SPEC 7.7.2). */
  generation: number
}>

/** What the Worker confirms for a request that it did not start because the provider is closing. */
export type WithdrawnReply = Readonly<{ kind: 'withdrawn' }>

export type WalState = 'normal' | 'read-paused' | 'write-stopped'

export type RegistrationSpec = Readonly<{
  scope: StorageScope
  combinationVersion: string
  manifestDigest: string
  /** Sorted by UTF-16 code units. */
  participants: readonly string[]
}>

export type WorkerRequest =
  | Readonly<{ kind: 'open'; create: RegistrationSpec | null }>
  | Readonly<{ kind: 'register'; registration: RegistrationSpec }>
  | Readonly<{ kind: 'commit'; request: CommitRequestV2; inputDigest: string }>
  | Readonly<{ kind: 'query'; identity: SqlIdentity }>
  | Readonly<{ kind: 'close' }>

export type OpenReply =
  | Readonly<{ kind: 'ready'; scope: StorageScope; singletons: readonly string[] }>
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'quarantined'; diagnostic: string }>
  | Readonly<{ kind: 'transient'; diagnostic: string }>
  | Readonly<{ kind: 'create_failed'; diagnostic: string }>
  | Readonly<{ kind: 'unknown'; diagnostic: string }>

export type RegisterReply =
  | Readonly<{ kind: 'registered' }>
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>
  | Readonly<{ kind: 'unknown'; diagnostic: string }>
  | WithdrawnReply

export type CommitWorkerRejection =
  | 'combination_unregistered'
  | 'manifest_mismatch'
  | 'material_unavailable'
  | 'participant_not_in_combination'
  | 'participant_dependency_missing'

export type CommitReply =
  | Readonly<{ kind: 'receipt'; receipt: ReceiptV2 }>
  | Readonly<{ kind: 'conflict'; existing: ReceiptV2 }>
  | Readonly<{ kind: 'rejected'; reason: CommitWorkerRejection }>
  | Readonly<{ kind: 'unknown'; diagnostic: string }>
  | Readonly<{ kind: 'quarantine'; diagnostic: string }>
  | WithdrawnReply

export type QueryReply =
  | Readonly<{ kind: 'receipt'; receipt: ReceiptV2 }>
  | Readonly<{ kind: 'none' }>
  | WithdrawnReply

export type InternalErrorReply = Readonly<{ kind: 'internal_error'; diagnostic: string }>

export type WorkerEnvelope = Readonly<{ id: number; generation: number; reply: unknown }>

/** A message that the Worker sends on its own, not as a reply (SPEC 12.3). */
export type WorkerEvent = Readonly<{ event: 'wal'; generation: number; state: WalState }>
