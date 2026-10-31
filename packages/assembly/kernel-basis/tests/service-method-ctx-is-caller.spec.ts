// basis `service-method-ctx-is-caller`：经调用方的 ctx 取到的 Service（`ctx.get(key)` 或 `ctx.<key>`）是可追踪代理，
// 方法里的 `this.ctx` 是调用方的上下文 ⇒ 方法里 `this.ctx.effect(...)` 登记的东西归调用方 fiber：
// 调用方撤除即撤掉那条登记，注册表本身照旧活着。
import { Context, Service } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { FIBER_STATE, plugin } from './basis-support.ts'

class ProbeRegistry extends Service {
  readonly entries = new Set<string>()
  constructor(ctx: Context) {
    super(ctx, 'probeRegistry')
  }
  register(entry: string) {
    return this.ctx.effect(() => {
      this.entries.add(entry)
      return () => void this.entries.delete(entry)
    })
  }
}

describe('service-method-ctx-is-caller', () => {
  it('调用方撤除 ⇒ 它登记的条目被撤掉，注册表仍在', async () => {
    const ctx = new Context()
    const registryFiber = await ctx.plugin(ProbeRegistry)
    const registry = ctx.get('probeRegistry') as ProbeRegistry
    const contributor = await ctx.plugin(
      plugin(
        'contributor',
        (inner: Context) => {
          ;(inner.get('probeRegistry') as ProbeRegistry).register('from-contributor')
        },
        ['probeRegistry'],
      ),
    )
    expect(registry.entries.has('from-contributor')).toBe(true)

    await contributor.dispose()
    expect(registry.entries.has('from-contributor')).toBe(false)
    expect(registryFiber.state as number).toBe(FIBER_STATE.ACTIVE)
  })

  it('register 返回的撤除函数单独调用也撤得掉', async () => {
    const ctx = new Context()
    await ctx.plugin(ProbeRegistry)
    const registry = ctx.get('probeRegistry') as ProbeRegistry
    let dispose: (() => unknown) | undefined
    await ctx.plugin(
      plugin(
        'contributor',
        (inner: Context) => {
          dispose = (inner.get('probeRegistry') as ProbeRegistry).register('early')
        },
        ['probeRegistry'],
      ),
    )
    expect(registry.entries.has('early')).toBe(true)
    await dispose?.()
    expect(registry.entries.has('early')).toBe(false)
  })
})
