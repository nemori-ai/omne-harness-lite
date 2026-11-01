import type { Context } from '@deepseek-ai/cordis'

export type RowId = string & { readonly __brand: 'RowId' }
export type ServiceName = string // S0 模式是私有名，形如 `s0.storage`；serve 模式是正式键，形如 `storage`
export type LayerSource = 'distribution' | 'operator'

/** 一行或一个入口对象的实现种类（DP1-C7）。 */
export type Implementation = 'real' | 'contract-double' | 's0-double'
/** 经 `defineRow` 或入口对象模块声明的实现：S0 替身不经声明进入。 */
export type DeclaredImplementation = Exclude<Implementation, 's0-double'>

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

/** 装配入口交给每个入口对象 `install` 的环境（DP1-C11、DP1-C17）。它不进插件，也不交给任何行。 */
export type EntryEnv = Readonly<{
  /** `--state-root`：已存在的绝对目录。 */
  stateRoot: string
  /** 入口自己按名读取一个受信名的上下文。 */
  readTrusted(name: ServiceName): Context
  /** 一次运行内共享。同一符号以不同的 `create` 再调用时抛出，`install` 随之失败。 */
  once<T>(key: symbol, create: () => T): T
}>

/** 一个入口对象模块（`src/entry/<对象>.ts`）。名字取定义包的键常量，受信与否由受信表决定。 */
export type EntryObjectModule = Readonly<{
  name: ServiceName
  implementation: DeclaredImplementation
  /** 本对象在方法里替哪些行登记关闭句柄（DP1-C15 入口对象承载）。默认为空。 */
  registersFor?: readonly RowId[]
  /** 在给定上下文上构造该名的服务定义子类。抛出即启动失败，退出 3。 */
  install(scope: Context, env: EntryEnv): void | Promise<void>
}>
