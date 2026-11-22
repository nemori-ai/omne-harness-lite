import { Context, Service } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { plugin } from './basis-support.ts'
import { StatusProbe, probeOf, settle } from './status-probe-support.ts'

/** A service that hands the call on to the probe, as one registry service does to another. */
class Facade extends Service {
  constructor(ctx: Context) {
    super(ctx, 'facade')
  }
  mount(tag: string): unknown {
    return (this.ctx.get('statusProbe') as StatusProbe).place(tag)
  }
}

const facadeOf = (ctx: Context): Facade => ctx.get('facade') as Facade

/** The probe and the facade are built in the body of one row, itself in an isolated scope. */
async function rows(): Promise<Readonly<{ root: Context; probe: StatusProbe }>> {
  const root = new Context()
  const entry = root.isolate('trustedA', Symbol('entry'))
  await entry.plugin(
    plugin('entry-row', (ctx: Context) => {
      new StatusProbe(ctx)
      new Facade(ctx)
    }),
  )
  return { root, probe: probeOf(root) }
}

describe('service-in-isolated-row-sees-other-rows', () => {
  it('建在一个隔离的行里的服务，收得到别的隔离作用域里 fiber 的状态事件', async () => {
    const { root, probe } = await rows()
    const other = root.isolate('trustedB', Symbol('usage'))
    const fiber = await other.plugin(plugin('usage-row', () => undefined, ['statusProbe']))
    await fiber.dispose()
    await settle()
    expect(probe.log.filter(line => line.startsWith('status usage-row'))).toEqual([
      'status usage-row PENDING->LOADING',
      'status usage-row LOADING->ACTIVE',
      'status usage-row ACTIVE->UNLOADING',
      'status usage-row UNLOADING->DISPOSED',
    ])
  })

  it('经 this.ctx.get 再转一层，效应仍落在最里面的调用方身上：它卸载时才撤', async () => {
    const { root, probe } = await rows()
    const other = root.isolate('trustedB', Symbol('usage'))
    let inner: { dispose: () => Promise<unknown> } | undefined
    const outer = await other.plugin(
      plugin(
        'usage-row',
        (ctx: Context) => {
          inner = ctx.plugin(
            plugin('usage-row.contribution', (leaf: Context) => facadeOf(leaf).mount('usage/v1'), [
              'facade',
            ]),
          )
        },
        ['facade'],
      ),
    )
    await settle()
    expect(probe.log).toContain('place usage/v1')
    expect(probe.log).not.toContain('take usage/v1')
    await inner?.dispose()
    await settle()
    const from = probe.log.indexOf('status usage-row.contribution ACTIVE->UNLOADING')
    expect(probe.log.slice(from, from + 2)).toEqual([
      'status usage-row.contribution ACTIVE->UNLOADING',
      'take usage/v1',
    ])
    expect(probe.log).not.toContain('status usage-row ACTIVE->UNLOADING')
    await outer.dispose()
  })
})
