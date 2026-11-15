import type { Context } from '@deepseek-ai/cordis'
import type { CloseReport } from '@omne-harness/telemetry-contract'
import type { CordisLogBridgeCounts } from '@omne-harness/telemetry-node/cordis'

export type RowId = string & { readonly __brand: 'RowId' }
export type ServiceName = string
export type LayerSource = 'distribution' | 'operator'

export type Implementation = 'real' | 'contract-double' | 's0-double'
export type DeclaredImplementation = Exclude<Implementation, 's0-double'>

export type TreeRow = Readonly<{
  id: RowId
  plugin: string
  config: unknown
  source: LayerSource
}>

export type OperatorOp =
  | Readonly<{ kind: 'replace'; id: RowId; config: unknown }>
  | Readonly<{ kind: 'disable'; id: RowId }>
  | Readonly<{ kind: 'insert'; after: RowId; row: Omit<TreeRow, 'source'> }>

export type LifecyclePhase = 'entry' | 'business' | 'composition' | 'storage'

export type RowManifest = Readonly<{
  provides: readonly ServiceName[]
  injects: readonly ServiceName[]
  phase: LifecyclePhase | null
  sameProviderGroup: string | null
}>

export type Visibility = ReadonlyMap<RowId, readonly ServiceName[]>

export type FiberStateName = 'LOADING' | 'ACTIVE' | 'PENDING' | 'FAILED' | 'DISPOSED'

export type RowState = Readonly<{
  id: RowId
  state: FiberStateName
  missing: readonly ServiceName[]
  blockedBy: readonly RowId[]
  error: Readonly<{ tag: string; message: string }> | null
}>

export type StopResult =
  | Readonly<{ kind: 'settled' }>
  | Readonly<{ kind: 'incomplete'; detail: string }>
  | Readonly<{ kind: 'failed'; detail: string }>

export type LifecycleHandle = Readonly<{
  phase: LifecyclePhase
  row: RowId
  start?: () => Promise<void>
  drain?: (deadlineMonotonicMs: number) => Promise<StopResult>
  stop: (deadlineMonotonicMs: number) => Promise<StopResult>
  assemblyReportSettled?: () => void
}>

export interface AssemblyLifecycle {
  register(handle: LifecycleHandle): void
}

export type HandleOutcome =
  | Readonly<{ row: RowId; phase: LifecyclePhase; result: StopResult }>
  | Readonly<{ row: RowId; phase: LifecyclePhase; result: Readonly<{ kind: 'not-registered' }> }>
  | Readonly<{
      row: RowId
      phase: LifecyclePhase
      result: Readonly<{ kind: 'disposed-before-stop'; detail: string }>
    }>

export type HostFilesReport =
  | Readonly<{ kind: 'settled'; count: 0 }>
  | Readonly<{ kind: 'host-files-unsettled'; count: number }>
  | Readonly<{
      kind: 'unavailable'
      diagnostic: 'maintenance-failed' | 'retirement-failed' | 'deadline'
    }>

export type TelemetryShutdownReport =
  | Readonly<{ kind: 'closed' } & CloseReport & CordisLogBridgeCounts>
  | Readonly<{ kind: 'not-registered' } & CordisLogBridgeCounts>
  | Readonly<{ kind: 'unavailable'; diagnostic: 'close-failed' | 'deadline' }>

export type DrainOutcome = Readonly<{ row: RowId; result: StopResult }>

export type ShutdownReport = Readonly<{
  overall: 'settled' | 'incomplete'
  outcomes: readonly HandleOutcome[]
  drains?: readonly DrainOutcome[]
  hostFiles?: HostFilesReport
  telemetry?: TelemetryShutdownReport
}>

export type EntryEnv = Readonly<{
  stateRoot: string
  readTrusted(name: ServiceName): Context
  once<T>(key: symbol, create: () => T): T
}>

export type EntryObjectModule = Readonly<{
  name: ServiceName
  implementation: DeclaredImplementation
  registersFor?: readonly RowId[]
  install(scope: Context, env: EntryEnv): void | Promise<void>
}>
