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
  phase?: LifecyclePhase
  log?: string[]
  hangOnStop?: boolean
}>

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
