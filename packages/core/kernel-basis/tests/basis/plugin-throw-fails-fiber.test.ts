// 待核对主张 3（六节点共用）：插件体抛出 ⇒ fiber FAILED、`await fiber` 拒绝、没有服务被 provide；
// config 不过 Standard Schema 校验 ⇒ 同样 FAILED 且插件体根本不跑（配置错误一律启动失败）。
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { plugin } from './support.ts'
import { z } from 'zod'
import { FIBER_STATE, definePlugin } from '../../src/cordis.ts'

describe('plugin-throw-fails-fiber', () => {
  it('插件体抛出 ⇒ FAILED', async () => {
    const ctx = new Context()
    const fiber = ctx.plugin(
      plugin('throws', () => {
        throw new Error('missing signing key')
      }),
    )
    await expect(fiber).rejects.toThrow('missing signing key')
    expect(fiber.state as number).toBe(FIBER_STATE.FAILED)
  })

  it('config 校验失败 ⇒ FAILED，插件体不跑，服务不出现', async () => {
    const ctx = new Context()
    let ran = false
    const defined = definePlugin({
      name: 'needs-positive-ttl',
      Config: z.object({ ttl: z.number().int().positive() }),
      apply(inner) {
        ran = true
        inner.provide('offers', {})
      },
    })
    const fiber = ctx.plugin(defined, { ttl: 0 })
    await expect(fiber).rejects.toThrow(/invalid config/)
    expect(fiber.state as number).toBe(FIBER_STATE.FAILED)
    expect(ran).toBe(false)
    expect(ctx.get('offers')).toBeUndefined()
  })

  it('config 合法 ⇒ ACTIVE，且插件体拿到的是校验后的值', async () => {
    const ctx = new Context()
    let received: unknown
    const defined = definePlugin({
      name: 'ok-config',
      Config: z.object({ ttl: z.number().int().positive() }),
      apply(_inner, config) {
        received = config
      },
    })
    const fiber = await ctx.plugin(defined, { ttl: 5 })
    expect(fiber.state as number).toBe(FIBER_STATE.ACTIVE)
    expect(received).toEqual({ ttl: 5 })
  })
})
