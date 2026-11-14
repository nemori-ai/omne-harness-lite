// 登记经 `this.ctx`（调用方的上下文）落在 `storage` 行的 fiber 上：不用箭头函数，
// 可变状态放在一个对象里，因为经调用方代理调用时 `this` 不是实例本身。
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
import { productionStorageCatalog } from '../rows/storage/production-catalog.ts'
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
        control.close({ initiator: 'assembly' }).catch(() => {})
        throw error
      }
    }
  }
}

export type StorageHostOptions = Readonly<{
  catalog?: () => SqlMaterialCatalog | Promise<SqlMaterialCatalog>
}>

export function storageHostModule(options: StorageHostOptions = {}): EntryObjectModule {
  const build = options.catalog ?? productionStorageCatalog
  return {
    name: storageHostKey,
    implementation: 'real',
    registersFor: [STORAGE_ROW],
    async install(scope) {
      const catalog = await build()
      const problems = catalogProblems(catalog)
      if (problems.length > 0) throw new Error(`storage materials rejected: ${problems.join('; ')}`)
      new StorageHostAdapter(scope, catalog)
    },
  }
}

export const storageHost: EntryObjectModule = storageHostModule()
