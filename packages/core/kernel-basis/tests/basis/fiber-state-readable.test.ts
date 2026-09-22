// 待核对主张 4（account-registration）：`ctx.fiber.state` 在插件体内与外部都可读；
// 并核对 FIBER_STATE 镜像的每个数值与 4.0.4 真实状态一致（PENDING/LOADING/ACTIVE/FAILED/DISPOSED）。
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { FIBER_STATE, fiberIsActive } from '../../src/index.ts'
import { plugin } from './support.ts'

describe('fiber-state-readable', () => {
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
