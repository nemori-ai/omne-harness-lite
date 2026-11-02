// 夹具入口对象 `storageHost`：关闭适配器的最小形状。`attachControl` 在被调用时经 `this.ctx`（调用方的上下文，
// Cordis 4.0.4 的 service-method-ctx-is-caller）登记 `storage` 阶段的句柄，所以登记落在 `storage` 行的 fiber 上。
// 方法用方法语法，不用箭头函数属性：箭头函数属性拿不到调用方的 `this`（N-r2-1）。
import type { Context } from '@deepseek-ai/cordis'
import { S0_ASSEMBLY_LIFECYCLE_KEY } from '../../../../src/lifecycle.ts'
import type {
  AssemblyLifecycle,
  EntryObjectModule,
  RowId,
  StopResult,
} from '../../../../src/types.ts'
import {
  FixtureStorageHostService,
  storageHostKey,
  type FixtureStorageControl,
} from '../definitions.ts'
import { storageEvents } from '../rows/storage/index.ts'

const STORAGE_ROW = 'storage' as RowId

export type FixtureHostOptions = Readonly<{
  /** false 时不登记句柄：用来检验 `not-registered`。 */
  register?: boolean
}>

class FixtureStorageHost extends FixtureStorageHostService {
  // 不用 `#` 私有字段：经调用方代理调用时 `this` 不是实例本身。
  private readonly controls: FixtureStorageControl[] = []
  private readonly registers: boolean

  constructor(ctx: Context, registers: boolean) {
    super(ctx)
    this.registers = registers
  }

  attachControl(control: FixtureStorageControl): void {
    this.controls.push(control)
    if (!this.registers) return
    const controls = this.controls
    const lifecycle: AssemblyLifecycle = this.ctx.get(S0_ASSEMBLY_LIFECYCLE_KEY)
    lifecycle.register({
      phase: 'storage',
      row: STORAGE_ROW,
      start: async () => {
        storageEvents.push('start')
      },
      stop: async (): Promise<StopResult> => {
        const results = await Promise.all(
          controls.map(saved => saved.close({ initiator: 'assembly' })),
        )
        return results.every(result => result === 'closed')
          ? { kind: 'settled' }
          : { kind: 'incomplete', detail: 'a control did not close' }
      },
      assemblyReportSettled: () => {
        for (const saved of controls) saved.assemblyReportSettled()
      },
    })
  }
}

export function fixtureStorageHost(options: FixtureHostOptions = {}): EntryObjectModule {
  return {
    name: storageHostKey,
    implementation: 'real',
    registersFor: [STORAGE_ROW],
    install(scope) {
      new FixtureStorageHost(scope, options.register ?? true)
    },
  }
}
