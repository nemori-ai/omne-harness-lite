// 待核对主张 1（六节点共用）：`inject` 没有可选形式——写进 inject 的服务缺席即 PENDING；
// 可选依赖的路径是 `ctx.get(name)`：不要求 inject，提供者不在或未 ACTIVE 时返回 undefined，且提供者换代不重跑调用方。
import { Context, type Fiber } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { plugin } from './support.ts'
import { FIBER_STATE, resolveOptional } from '../../src/index.ts'

describe('inject-has-no-optional-form', () => {
  it('可选读取过滤 PENDING、LOADING 与 UNLOADING，只在提供者 ACTIVE 时返回服务', async () => {
    const ctx = new Context()
    const enteredLoad = Promise.withResolvers<void>()
    const releaseLoad = Promise.withResolvers<void>()
    const enteredDisposer = Promise.withResolvers<void>()
    const releaseDisposer = Promise.withResolvers<void>()
    const credentials = { gen: 'held' }
    let runs = 0
    const consumer = await ctx.plugin(
      plugin('optional-observer', () => {
        runs += 1
      }),
    )
    const provider = ctx.plugin(
      plugin(
        'controlled-provider',
        async inner => {
          inner.effect(function* () {
            yield inner.provide('credentials', credentials)
            // 同一 effect 逆序释放；屏障未打开前服务仍在 store，能区分状态过滤和已注销。
            yield async () => {
              enteredDisposer.resolve()
              await releaseDisposer.promise
            }
          })
          enteredLoad.resolve()
          await releaseLoad.promise
        },
        ['ready'],
      ),
    )
    let prerequisite: Fiber | undefined
    let removal: Promise<void> | undefined
    try {
      await provider
      expect(provider.state).toBe(FIBER_STATE.PENDING)
      expect(resolveOptional(consumer.ctx, 'credentials')).toBeUndefined()

      prerequisite = await ctx.plugin(
        plugin('ready-provider', inner => inner.provide('ready', true)),
      )
      await enteredLoad.promise
      expect(provider.state).toBe(FIBER_STATE.LOADING)
      expect(consumer.ctx.get('credentials', false)).toBe(credentials)
      expect(consumer.ctx.get('credentials')).toBeUndefined()
      expect(resolveOptional(consumer.ctx, 'credentials')).toBeUndefined()

      releaseLoad.resolve()
      await provider
      expect(provider.state).toBe(FIBER_STATE.ACTIVE)
      expect(resolveOptional(consumer.ctx, 'credentials')).toBe(credentials)

      removal = prerequisite.dispose()
      await enteredDisposer.promise
      expect(provider.state).toBe(FIBER_STATE.UNLOADING)
      expect(consumer.ctx.get('credentials', false)).toBe(credentials)
      expect(consumer.ctx.get('credentials')).toBeUndefined()
      expect(resolveOptional(consumer.ctx, 'credentials')).toBeUndefined()

      releaseDisposer.resolve()
      await removal
      await provider
      expect(provider.state).toBe(FIBER_STATE.PENDING)
      expect(consumer.ctx.get('credentials', false)).toBeUndefined()
      expect(resolveOptional(consumer.ctx, 'credentials')).toBeUndefined()
      expect(consumer.state).toBe(FIBER_STATE.ACTIVE)
      expect(runs).toBe(1)
    } finally {
      releaseLoad.resolve()
      releaseDisposer.resolve()
      await removal
      await provider.dispose()
      await prerequisite?.dispose()
      await consumer.dispose()
    }
  })

  it('inject 的对象形式也是必需：缺席即 PENDING', async () => {
    const ctx = new Context()
    let ran = false
    const fiber = await ctx.plugin(
      plugin(
        'object-inject',
        () => {
          ran = true
        },
        { missing: undefined },
      ),
    )
    expect(ran).toBe(false)
    expect(fiber.state as number).toBe(FIBER_STATE.PENDING)
  })

  it('ctx.get 不要求 inject：缺席返回 undefined，出现后可取到，换代不重跑调用方', async () => {
    const ctx = new Context()
    let runs = 0
    let captured: Context | undefined
    await ctx.plugin(
      plugin('optional-consumer', (inner: Context) => {
        runs += 1
        captured = inner
      }),
    )
    expect(runs).toBe(1)
    expect(resolveOptional(captured!, 'credentials')).toBeUndefined()

    const fiberA = await ctx.plugin(
      plugin('credA', (inner: Context) => inner.provide('credentials', { gen: 'A' })),
    )
    expect(resolveOptional<{ gen: string }>(captured!, 'credentials')?.gen).toBe('A')
    await fiberA.dispose()
    expect(resolveOptional(captured!, 'credentials')).toBeUndefined()
    await ctx.plugin(
      plugin('credB', (inner: Context) => inner.provide('credentials', { gen: 'B' })),
    )
    expect(resolveOptional<{ gen: string }>(captured!, 'credentials')?.gen).toBe('B')
    expect(runs).toBe(1) // 调用方插件体没有因为 credentials 换代而重跑
  })
})
