import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { FIBER_STATE, plugin } from './basis-support.ts'
import { definePlugin, type StandardSchema } from '@omne-harness/kernel-basis/cordis'

const positiveTtl: StandardSchema<{ ttl: number }> = {
  '~standard': {
    version: 1,
    vendor: 'basis-probe',
    validate(value) {
      const ttl = (value as { ttl?: unknown } | null)?.ttl
      if (typeof ttl === 'number' && Number.isInteger(ttl) && ttl > 0) return { value: { ttl } }
      return { issues: [{ message: 'ttl must be a positive integer' }] }
    },
  },
}

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
      Config: positiveTtl,
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
      Config: positiveTtl,
      apply(_inner, config) {
        received = config
      },
    })
    const fiber = await ctx.plugin(defined, { ttl: 5 })
    expect(fiber.state as number).toBe(FIBER_STATE.ACTIVE)
    expect(received).toEqual({ ttl: 5 })
  })
  it('FAILED 的 fiber 不因提供者换代重跑插件体', async () => {
    const ctx = new Context()
    let runs = 0
    const first = await ctx.plugin(plugin('first', inner => inner.provide('svc', 1)))
    const consumer = ctx.plugin(
      plugin(
        'fails-once',
        () => {
          runs += 1
          if (runs === 1) throw new Error('first run fails')
        },
        ['svc'],
      ),
    )
    await expect(consumer).rejects.toThrow('first run fails')
    await first.dispose()
    await ctx.plugin(plugin('second', inner => inner.provide('svc', 2)))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(runs).toBe(1)
    expect(consumer.state as number).toBe(FIBER_STATE.FAILED)
  })
  it('加载途中必需服务被撤，插件体随后抛出：不记失败，回到 PENDING；服务回来就重跑', async () => {
    const ctx = new Context()
    ctx.logger.exporter({ levels: { default: -1 }, export: () => {} })
    let runs = 0
    let release!: () => void
    const held = new Promise<void>(resolve => (release = resolve))
    const provider = await ctx.plugin(plugin('provider', inner => inner.provide('svc', 1)))
    const loading = ctx.plugin(
      plugin(
        'throws-after-withdrawal',
        async () => {
          runs += 1
          await held
          throw new Error('load failed')
        },
        ['svc'],
      ),
    )
    await new Promise(resolve => setTimeout(resolve, 0))
    const retiring = provider.dispose()
    release()
    await expect(loading.then(() => 'resolved')).resolves.toBe('resolved')
    await retiring
    expect(loading.state as number).toBe(FIBER_STATE.PENDING)
    expect(runs).toBe(1)

    await ctx.plugin(plugin('back', inner => inner.provide('svc', 2)))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(runs).toBe(2)
  })
})
