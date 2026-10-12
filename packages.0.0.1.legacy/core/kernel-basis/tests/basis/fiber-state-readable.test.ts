// 待核对主张 4（account-registration）：`ctx.fiber.state` 在插件体内与外部都可读；
// 并核对 FIBER_STATE 镜像的每个数值与 4.0.4 真实状态一致，包括异步撤除中的 UNLOADING。
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { FIBER_STATE, fiberIsActive } from '../../src/cordis.ts'
import { plugin } from './support.ts'

describe('fiber-state-readable', () => {
  it('异步 disposer 未完成时真实状态为 UNLOADING（5），完成后才为 DISPOSED', async () => {
    const ctx = new Context()
    const enteredDisposer = Promise.withResolvers<void>()
    const releaseDisposer = Promise.withResolvers<void>()
    const fiber = await ctx.plugin(
      plugin('held-disposer', inner => {
        inner.effect(() => async () => {
          enteredDisposer.resolve()
          await releaseDisposer.promise
        })
      }),
    )
    expect(fiberIsActive(fiber.ctx)).toBe(true)

    let disposalSettled = false
    const disposal = fiber.dispose().then(() => {
      disposalSettled = true
    })
    try {
      await enteredDisposer.promise
      expect(fiber.state).toBe(5)
      expect(fiber.state).toBe(FIBER_STATE.UNLOADING)
      expect(fiberIsActive(fiber.ctx)).toBe(false)
      expect(disposalSettled).toBe(false)
    } finally {
      releaseDisposer.resolve()
      await disposal
    }

    expect(disposalSettled).toBe(true)
    expect(fiber.state).toBe(FIBER_STATE.DISPOSED)
    expect(fiberIsActive(fiber.ctx)).toBe(false)
  })

  it('镜像数值与真实状态一致', async () => {
    const ctx = new Context()
    let stateInsideBody: number | undefined
    let captured: Context | undefined

    const pending = await ctx.plugin(plugin('pending', () => {}, ['nothing']))
    expect(pending.state as number).toBe(FIBER_STATE.PENDING)

    const active = await ctx.plugin(
      plugin('active', (inner: Context) => {
        stateInsideBody = inner.fiber.state as number
        captured = inner
      }),
    )
    expect(stateInsideBody).toBe(FIBER_STATE.LOADING)
    expect(active.state as number).toBe(FIBER_STATE.ACTIVE)
    expect(fiberIsActive(captured!)).toBe(true)

    const failed = ctx.plugin(
      plugin('failed', () => {
        throw new Error('boom')
      }),
    )
    await expect(failed).rejects.toThrow('boom')
    expect(failed.state as number).toBe(FIBER_STATE.FAILED)

    await active.dispose()
    expect(active.state as number).toBe(FIBER_STATE.DISPOSED)
    expect(fiberIsActive(captured!)).toBe(false)
  })
})
