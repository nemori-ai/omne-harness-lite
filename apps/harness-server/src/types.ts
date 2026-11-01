export type RowId = string & { readonly __brand: 'RowId' }
export type ServiceName = string // S0 私有名，形如 `s0.storage`
export type LayerSource = 'distribution' | 'operator'

export type TreeRow = Readonly<{
  id: RowId
  plugin: string // allowlist 中的 ./cordis 导出名
  config: unknown // 已过边界 schema 的纯数据
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
  phase: LifecyclePhase | null // 预期登记的关闭阶段；null 表示不登记
  sameProviderGroup: string | null
}>

/** 行 id → 该行可见的受信名。不在表中的行（含运维者插入的行）可见集合为空。 */
export type Visibility = ReadonlyMap<RowId, readonly ServiceName[]>

export type FiberStateName = 'LOADING' | 'ACTIVE' | 'PENDING' | 'FAILED' | 'DISPOSED'

export type RowState = Readonly<{
  id: RowId
  state: FiberStateName
  missing: readonly ServiceName[] // 直接缺项：本行 inject 中没有可见 ACTIVE 提供者的名
  blockedBy: readonly RowId[] // 提供行存在但未 ACTIVE
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
  stop: (deadlineMonotonicMs: number) => Promise<StopResult>
  assemblyReportSettled?: () => void // 只有 storage 阶段提供
}>

export interface AssemblyLifecycle {
  /** 登记落在调用方 fiber；该 fiber 撤除时退登记（IC-13）。 */
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

export type ShutdownReport = Readonly<{
  overall: 'settled' | 'incomplete'
  outcomes: readonly HandleOutcome[]
}>
