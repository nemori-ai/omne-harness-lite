// 合成夹具行：行 id 不在 AA 行表里，只用来检验机制（阶段次序、行体承载、同标签第二个提供者）。
// 它们不参加 `real-manifests-sync` 的比较。
import { Service, type Context, type Plugin } from '@deepseek-ai/cordis'
import { defineRow, type RowHandle } from '../../../../src/row.ts'
import type { LifecyclePhase, ServiceName } from '../../../../src/types.ts'

class SyntheticService extends Service {
  constructor(ctx: Context, name: ServiceName) {
    super(ctx, name)
  }
}

export type SyntheticRowOptions = Readonly<{
  id: string
  provides?: readonly ServiceName[]
  injects?: readonly ServiceName[]
  /** 给出阶段时是行体承载的行，`start` 与 `stop` 写进 `log`。 */
  phase?: LifecyclePhase
  log?: string[]
  /** 行体的 `stop` 永不结束，用来检验截止时间。 */
  hangOnStop?: boolean
}>

/** 一个行体承载或无阶段的合成行。 */
export function syntheticRow(options: SyntheticRowOptions): Plugin.Object {
  const provides = options.provides ?? []
  const manifest = { provides, injects: options.injects ?? [], sameProviderGroup: null }
  const log = options.log ?? []
  if (options.phase === undefined) {
    return defineRow({
      row: options.id,
      implementation: 'real',
      manifest,
      lifecycle: { kind: 'none' },
      plugin: {
        name: options.id,
        inject: [...manifest.injects],
        apply(ctx: Context) {
          for (const name of provides) new SyntheticService(ctx, name)
        },
      },
    })
  }
  return defineRow({
    row: options.id,
    implementation: 'real',
    manifest,
    lifecycle: { kind: 'body', phase: options.phase },
    body: async (ctx: Context): Promise<RowHandle> => {
      for (const name of provides) new SyntheticService(ctx, name)
      return {
        start: async () => {
          log.push(`start:${options.id}`)
        },
        stop: () => {
          log.push(`stop:${options.id}`)
          if (options.hangOnStop) return new Promise(() => {})
          return Promise.resolve({ kind: 'settled' })
        },
      }
    },
  })
}
