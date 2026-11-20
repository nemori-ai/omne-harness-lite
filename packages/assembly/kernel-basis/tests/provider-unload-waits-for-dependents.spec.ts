import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { FIBER_STATE, plugin } from './basis-support.ts'

const settled = async (promise: Promise<unknown>, ms: number) => {
  let done = false
  void promise.then(
    () => (done = true),
    () => (done = true),
  )
  await new Promise<void>(resolve => setTimeout(resolve, ms))
  return done
}

describe('provider-unload-waits-for-dependents', () => {
  it('依赖方的 disposer 没返回 ⇒ 提供者的 dispose 一直不返回；放行后两者都卸完', async () => {
    const ctx = new Context()
    const order: string[] = []
    let release!: () => void
    const held = new Promise<void>(resolve => (release = resolve))
    const provider = await ctx.plugin(
      plugin('provider', inner => {
        inner.provide('held', 'value')
        inner.effect(() => () => void order.push('provider effect'))
      }),
    )
    const dependent = await ctx.plugin(
      plugin(
        'dependent',
        inner => {
          inner.effect(() => async () => {
            await held
            order.push('dependent effect')
          })
        },
        ['held'],
      ),
    )

    const disposing = provider.dispose()
    expect(await settled(disposing, 30)).toBe(false)
    expect(ctx.get('held')).toBeUndefined()
    expect(dependent.state as number).toBe(FIBER_STATE.UNLOADING)
    expect(order).toEqual([])

    release()
    await disposing
    expect(order).toEqual(['dependent effect', 'provider effect'])
    expect(dependent.state as number).toBe(FIBER_STATE.PENDING)
  })

  it('没有依赖方 ⇒ 提供者的 dispose 立即卸完', async () => {
    const ctx = new Context()
    const provider = await ctx.plugin(plugin('lonely', inner => inner.provide('lonely', 1)))
    await provider.dispose()
    expect(provider.state as number).toBe(FIBER_STATE.DISPOSED)
  })

  it('只按调用现取、没有 inject 的使用方不算依赖方：提供者的 dispose 不等它', async () => {
    const ctx = new Context()
    let release!: () => void
    const held = new Promise<void>(resolve => (release = resolve))
    const provider = await ctx.plugin(plugin('provider', inner => inner.provide('loose', 'value')))
    const user = await ctx.plugin(
      plugin('loose-user', inner => {
        expect(inner.get('loose')).toBe('value')
        inner.effect(() => () => held)
      }),
    )
    await provider.dispose()
    expect(user.state as number).toBe(FIBER_STATE.ACTIVE)
    release()
    await user.dispose()
  })
})
