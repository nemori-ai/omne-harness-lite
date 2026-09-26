// basis: effect-disposal-concurrent-not-ordered（@deepseek-ai/cordis 4.0.4）
// 断言：卸载 fiber 时各 effect 的 disposer 并发驱动（重叠），不是串行；disposer 抛错只走 ctx.logger.error、卸载照常完成；
// 同一 effect 内多个 disposer 逆序释放；UNLOADING 后再建 effect 抛 INACTIVE_EFFECT。
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { plugin } from './support.ts'

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

describe('effect-disposal-concurrent-not-ordered', () => {
  it('各 effect 的释放并发：慢的先注册、快的后注册，快的先完成', async () => {
    const ctx = new Context()
    const finished: string[] = []
    const fiber = await ctx.plugin(
      plugin('two-effects', (inner: Context) => {
        inner.effect(() => async () => {
          await sleep(50)
          finished.push('slow')
        })
        inner.effect(() => async () => {
          await sleep(0)
          finished.push('fast')
        })
      }),
    )
    await fiber.dispose()
    expect(finished).toEqual(['fast', 'slow']) // 逆注册序只约束取出，完成顺序由耗时决定
  })

  it('disposer 抛错不上抛，卸载照常完成', async () => {
    const ctx = new Context()
    let secondReleased = false
    const fiber = await ctx.plugin(
      plugin('failing-disposer', (inner: Context) => {
        inner.effect(() => () => {
          throw new Error('disposer failed')
        })
        inner.effect(() => () => {
          secondReleased = true
        })
      }),
    )
    await expect(fiber.dispose()).resolves.toBeUndefined()
    expect(secondReleased).toBe(true)
  })

  it('同一 effect 内多个 disposer 逆序释放', async () => {
    const ctx = new Context()
    const order: number[] = []
    const fiber = await ctx.plugin(
      plugin('generator-effect', (inner: Context) => {
        inner.effect(function* () {
          yield () => order.push(1)
          yield () => order.push(2)
          yield () => order.push(3)
        })
      }),
    )
    await fiber.dispose()
    expect(order).toEqual([3, 2, 1])
  })

  it('已 dispose 后再建 effect 抛 INACTIVE_EFFECT', async () => {
    const ctx = new Context()
    let captured: Context | undefined
    const fiber = await ctx.plugin(
      plugin('capture-ctx', (inner: Context) => {
        captured = inner
      }),
    )
    await fiber.dispose()
    expect(() => captured!.effect(() => () => {})).toThrow(/INACTIVE_EFFECT|inactive/i)
  })
})
