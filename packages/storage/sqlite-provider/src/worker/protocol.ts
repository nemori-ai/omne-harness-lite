import type {
  CommitRequestV2,
  ReceiptV2,
  SqlIdentity,
  SqlMaterialCatalog,
  StorageScope,
} from '@omne-harness/sql-contract'

export type WorkerEnv = Readonly<{
  file: string
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
  /** One Int32 shared with the control side, 1 once closing. Read before each request starts, so it
   *  does not depend on when a message reaches the Worker. */
  closingFlag: SharedArrayBuffer
  groupMaxOperations: number
  groupCollectMs: number
  groupMaxInputBytes: number
  groupMaxResponseReservationBytes: number
  groupMaxExecutionSliceMs: number
  generation: number
}>

export type WithdrawnReply = Readonly<{ kind: 'withdrawn' }>

export type WalState = 'normal' | 'read-paused' | 'write-stopped'

export type RegistrationSpec = Readonly<{
  scope: StorageScope
  combinationVersion: string
  manifestDigest: string
  participants: readonly string[]
}>

export type WorkerRequest =
  | Readonly<{ kind: 'open'; create: RegistrationSpec | null }>
  | Readonly<{ kind: 'register'; registration: RegistrationSpec }>
  | Readonly<{ kind: 'commit'; request: CommitRequestV2; inputDigest: string }>
  | Readonly<{ kind: 'query'; identity: SqlIdentity }>
  | Readonly<{ kind: 'close' }>

export type OpenReply =
  | Readonly<{
      kind: 'ready'
      scope: StorageScope
      singletons: readonly string[]
      created: boolean
    }>
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
  | 'domain_unavailable'
  | 'manifest_mismatch'
  | 'material_unavailable'
  | 'participant_not_in_combination'
  | 'participant_dependency_missing'

export type CommitReply =
  | Readonly<{ kind: 'receipt'; receipt: ReceiptV2; recalled: boolean }>
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

export type WorkerEvent = Readonly<{ event: 'wal'; generation: number; state: WalState }>
