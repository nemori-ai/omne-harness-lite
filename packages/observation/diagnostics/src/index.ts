import type { OpaqueId, OperationRef } from '@omne-harness-lite/work-data'
import type { Causality, Counter, Position, Principal, Watermark } from '@omne-harness-lite/records'
import { createLocalDiagnosticsDirectory as createLocalDiagnosticsDirectoryImplementation } from './runtime.js'

export type DiagnosticIdentity = Readonly<{
  tenantId: OpaqueId | null
  principal: Principal
  operation?: OperationRef
  causality: Causality
}>

export type DiagnosticPoint = Readonly<{
  component: string
  phase: string
  code: string
  level: 'debug' | 'info' | 'warn' | 'error'
  diagnosticId?: OpaqueId
  position?: Position
  logical?: Watermark
  durable?: Watermark
  measures?: Readonly<{
    durationMs?: number
    queueDepth?: number
    pendingBytes?: number
    count?: number
  }>
}>

declare const diagnosticContextBrand: unique symbol
export type DiagnosticContext = Readonly<{ [diagnosticContextBrand]: true }>

export type DiagnosticEnd = Readonly<{
  code: string
  outcome: 'ok' | 'rejected' | 'failed' | 'cancelled' | 'unknown' | 'interrupted'
}>

export interface DiagnosticSpan {
  readonly context: DiagnosticContext
  end(result: DiagnosticEnd): void
}

export interface Diagnostics {
  newId(): OpaqueId
  scope(identity: DiagnosticIdentity, parent?: DiagnosticContext): DiagnosticContext
  current(): DiagnosticContext | null
  log(context: DiagnosticContext, point: DiagnosticPoint): void
  startSpan(context: DiagnosticContext, point: DiagnosticPoint): DiagnosticSpan
  within<T>(context: DiagnosticContext, body: () => T): T
}

export type DiagnosticGapReason =
  | 'level_excluded'
  | 'buffer_capacity'
  | 'span_capacity'
  | 'invalid_projection'
  | 'write_unavailable'
  | 'retention_capacity'
  | 'closing'
  | 'crash_unknown'

export type DiagnosticGap = Readonly<{
  reason: DiagnosticGapReason
  firstSeq: Counter | null
  lastSeq: Counter | null
  count: Counter | null
  quality: 'counted' | 'unknown'
}>

export type DiagnosticStatus = Readonly<{
  sourceId: OpaqueId
  phase: 'active' | 'degraded' | 'closing' | 'closed'
  attemptedThrough: Counter
  acceptedCount: Counter
  droppedCount: Counter
  pendingBytes: number
  writtenBytes: Counter
  activeSpans: number
  writeProgress: 'idle' | 'pending' | 'stalled' | 'failed'
  pendingIdleMs: number | null
  gaps: readonly DiagnosticGap[]
  lastErrorCode: string | null
  resource: 'held' | 'released' | 'unknown'
}>

export type DiagnosticClose = Readonly<{
  status: 'closed' | 'blocked'
  state: DiagnosticStatus
}>

export interface DiagnosticsRuntime {
  readonly diagnostics: Diagnostics
  inspect(): DiagnosticStatus
  close(options: Readonly<{ deadlineMs: number }>): Promise<DiagnosticClose>
}

export type LocalDiagnosticsDirectoryOptions = Readonly<{
  directory: string
  maxDirectoryBytes: number
  maxFiles: number
}>

export type LocalDiagnosticSourceOptions = Readonly<{
  instanceId: OpaqueId
  sourceId: OpaqueId
  level: 'debug' | 'info' | 'warn' | 'error'
  maxRecordBytes: number
  maxActiveSpans: number
  maxBufferBytes: number
  maxFileBytes: number
}>

export type DirectorySourceState = Readonly<{
  sourceId: OpaqueId | null
  phase: 'preparing' | 'live' | 'closing' | 'retained'
  chargedBytes: Counter
  reservedBytes: Counter
  resource: 'held' | 'released' | 'unknown'
}>

export type DiagnosticDirectoryStatus = Readonly<{
  phase: 'preparing' | 'active' | 'failed' | 'closing' | 'closed'
  lock: 'held' | 'released' | 'unknown'
  scan: 'incomplete' | 'complete'
  chargedBytes: Counter | null
  reservedBytes: Counter
  materializedFiles: number
  reservedFiles: number
  sources: readonly DirectorySourceState[]
  lastErrorCode: string | null
  resource: 'held' | 'released' | 'unknown'
}>

export type DiagnosticDirectoryClose = Readonly<{
  status: 'closed' | 'blocked'
  state: DiagnosticDirectoryStatus
}>

export interface DiagnosticsDirectoryCleanup {
  inspect(): DiagnosticDirectoryStatus
  close(options: Readonly<{ deadlineMs: number }>): Promise<DiagnosticDirectoryClose>
}

export type LocalDiagnosticSourceResult =
  | Readonly<{ status: 'invalid'; code: string }>
  | Readonly<{ status: 'unavailable'; code: string }>
  | Readonly<{ status: 'created'; runtime: DiagnosticsRuntime }>

export interface LocalDiagnosticsDirectory extends DiagnosticsDirectoryCleanup {
  create(options: LocalDiagnosticSourceOptions): Promise<LocalDiagnosticSourceResult>
}

export type LocalDiagnosticsDirectoryResult =
  | Readonly<{ status: 'invalid'; code: string }>
  | Readonly<{
      status: 'unavailable'
      code: string
      cleanup: DiagnosticsDirectoryCleanup | null
    }>
  | Readonly<{ status: 'created'; owner: LocalDiagnosticsDirectory }>

export function createLocalDiagnosticsDirectory(
  options: LocalDiagnosticsDirectoryOptions,
): Promise<LocalDiagnosticsDirectoryResult> {
  return createLocalDiagnosticsDirectoryImplementation(options)
}
