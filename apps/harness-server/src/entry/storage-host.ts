// 入口对象 `storageHost`（sql-contract §2.3）：装配入口交给 `storage` 行的三项运行时对象。`materials` 是本构建的材料目录，
// 构造期核对每份材料的摘要；`closeLeases` 是装配关闭协议的租约口；`attachControl` 是装配关闭适配器，它保存每一代控制口，
// 并在被调用时经 `this.ctx`（调用方的上下文，Cordis 4.0.4 的 service-method-ctx-is-caller）替 `storage` 行登记
// `storage` 阶段的句柄，所以登记落在 `storage` 行的 fiber 上。方法用方法语法，不用箭头函数属性（N-r2-1）。
// 可变状态放在一个对象里，不放在实例的原始类型字段上：经调用方代理调用时 `this` 不是实例本身。
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import type {
  CloseLeaseHandle,
  CloseLeasePort,
  SqlMaterialCatalog,
  StorageCloseResult,
  StorageControl,
  StorageHost,
} from '@omne-harness/sql-contract'
import { StorageHostService, storageHostKey } from '@omne-harness/sql-contract/cordis'
import { S0_ASSEMBLY_LIFECYCLE_KEY } from '../lifecycle.ts'
import { storageCatalog } from '../rows/storage/catalog.ts'
import { monotonicClock } from '../shutdown.ts'
import type { AssemblyLifecycle, EntryObjectModule, RowId, StopResult } from '../types.ts'

const STORAGE_ROW = 'storage' as RowId

function digestOfFile(moduleUrl: string): string | null {
  try {
    const url = new URL(moduleUrl)
    if (url.protocol !== 'file:') return null
    return createHash('sha256')
      .update(readFileSync(fileURLToPath(url)))
      .digest('hex')
  } catch {
    return null
  }
}

/** 构造期的材料核对（acceptance 4）：每份材料的文件可读且摘要等于描述符写的值。问题按材料点名。 */
export function catalogProblems(catalog: SqlMaterialCatalog): string[] {
  const items: readonly (readonly [material: string, moduleUrl: string, expected: string])[] = [
    ...catalog.participants.map(
      item => [`participant ${item.participant}`, item.moduleUrl, item.codeDigest] as const,
    ),
    ...catalog.migrations.map(
      item => [`migration ${item.owner}/${item.id}`, item.moduleUrl, item.checksum] as const,
    ),
    ...catalog.readHandlers.map(
      item => [`handler ${item.handler}`, item.moduleUrl, item.codeDigest] as const,
    ),
  ]
  const problems: string[] = []
  for (const [material, moduleUrl, expected] of items) {
    const actual = digestOfFile(moduleUrl)
    if (actual === null) problems.push(`material_unreadable: ${material}`)
    else if (actual !== expected) problems.push(`material_digest_mismatch: ${material}`)
  }
  return problems
}

type AdapterState = {
  /** 每一代交来的控制口，直到装配报告确定（§2.3、§13.4）。 */
  readonly controls: StorageControl[]
  readonly leases: Set<CloseLeaseHandle>
  admitting: boolean
}

type CloseSummary = Readonly<{ failed: number; writer: number; reader: number }>

function summarize(results: readonly PromiseSettledResult<StorageCloseResult>[]): CloseSummary {
  let failed = 0
  let writer = 0
  let reader = 0
  for (const result of results) {
    if (result.status === 'rejected') {
      failed += 1
      continue
    }
    if (result.value.kind !== 'incomplete') continue
    for (const residual of result.value.residuals) {
      if (residual.workerRole === 'writer') writer += 1
      else reader += 1
    }
  }
  return { failed, writer, reader }
}

/**
 * 句柄的 `stop(D)`：先停止租约准入，再对每个保存的控制口调用 `close({ initiator: 'assembly' })`，等全部结果或到达 D。
 * 全部 `closed` 答 `settled`；有 `incomplete` 时 `detail` 只写残留 Worker 的个数与角色；到达 D 答 `incomplete`。
 * 迟到的结果不改写已给出的答案。
 */
async function closeAll(state: AdapterState, deadlineMonotonicMs: number): Promise<StopResult> {
  state.admitting = false
  const pending = state.controls.map(control => control.close({ initiator: 'assembly' }))
  const timer = monotonicClock.after(deadlineMonotonicMs - monotonicClock.now())
  const raced = await Promise.race([
    Promise.allSettled(pending).then(results => ({ kind: 'done' as const, results })),
    timer.promise.then(() => ({ kind: 'deadline' as const })),
  ])
  timer.cancel()
  if (raced.kind === 'deadline')
    return {
      kind: 'incomplete',
      detail: `deadline reached before ${String(pending.length)} storage control(s) closed`,
    }
  const summary = summarize(raced.results)
  if (summary.failed > 0)
    return { kind: 'failed', detail: `${String(summary.failed)} storage control(s) threw on close` }
  const residuals = summary.writer + summary.reader
  if (residuals === 0) return { kind: 'settled' }
  return {
    kind: 'incomplete',
    detail: `${String(residuals)} residual storage worker(s): writer ${String(summary.writer)}, reader ${String(summary.reader)}`,
  }
}

/**
 * `storageHost` 的服务实例：构造定义的子类（IC-2）。sql-contract 把 `attachControl` 声明为只读属性，子类不能用方法
 * 语法覆盖它（TS2425），所以用 `function` 表达式赋值：经调用方代理调用时 `this` 仍是那个代理，`this.ctx` 是调用方的
 * 上下文，与方法语法相同；箭头函数做不到这一点（N-r2-1）。
 */
export class StorageHostAdapter extends StorageHostService {
  readonly materials: SqlMaterialCatalog
  readonly closeLeases: CloseLeasePort
  readonly attachControl: StorageHost['attachControl']
  private readonly state: AdapterState

  constructor(ctx: Context, materials: SqlMaterialCatalog) {
    super(ctx)
    this.materials = materials
    const state: AdapterState = { controls: [], leases: new Set(), admitting: true }
    this.state = state
    this.closeLeases = {
      admit(name: string): CloseLeaseHandle {
        if (!state.admitting)
          throw new Error(`storage close lease refused: the assembly stopped admission (${name})`)
        const handle: CloseLeaseHandle = Object.freeze({ name })
        state.leases.add(handle)
        return handle
      },
      release(handle: CloseLeaseHandle): void {
        state.leases.delete(handle)
      },
    }
    /**
     * 先保存交来的控制口，再经 `this.ctx` 登记句柄：登记落在调用它的 `storage` 行的 fiber 上。登记被拒
     * （`phase-mismatch`、`duplicate`、`generation-change`）时关闭刚保存的控制口并重新抛出（N-r2-2），该行随之 FAILED。
     */
    this.attachControl = function attachControl(this: StorageHostAdapter, control: StorageControl) {
      state.controls.push(control)
      const lifecycle: AssemblyLifecycle = this.ctx.get(S0_ASSEMBLY_LIFECYCLE_KEY)
      try {
        lifecycle.register({
          phase: 'storage',
          row: STORAGE_ROW,
          stop: deadline => closeAll(state, deadline),
          assemblyReportSettled: () => {
            for (const saved of state.controls) saved.assemblyReportSettled()
          },
        })
      } catch (error) {
        // 结果只作诊断：这一代控制口不再有登记者去等它。
        control.close({ initiator: 'assembly' }).catch(() => {})
        throw error
      }
    }
  }
}

export type StorageHostOptions = Readonly<{
  /** 测试输入：替换本构建的材料目录。 */
  catalog?: () => SqlMaterialCatalog
}>

export function storageHostModule(options: StorageHostOptions = {}): EntryObjectModule {
  const build = options.catalog ?? storageCatalog
  return {
    name: storageHostKey,
    implementation: 'real',
    registersFor: [STORAGE_ROW],
    install(scope) {
      const catalog = build()
      const problems = catalogProblems(catalog)
      if (problems.length > 0) throw new Error(`storage materials rejected: ${problems.join('; ')}`)
      new StorageHostAdapter(scope, catalog)
    },
  }
}

export const storageHost: EntryObjectModule = storageHostModule()
