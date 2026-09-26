// 待核对主张 2（六节点共用）：`ctx.provide` 经 effect 纳管——fiber 撤除后服务消失、依赖它的插件回到 PENDING；
// 插件体在第二个 provide 之后抛出时，已 provide 的第一个服务随 fiber 一起撤掉，不会留下半个服务面。
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { FIBER_STATE } from '../../src/index.ts'
import { plugin } from './support.ts'

describe('provide-is-effect-managed', () => {
  it('撤除提供者 ⇒ 服务不可解析、依赖者 PENDING', async () => {
    const ctx = new Context()
    const provider = await ctx.plugin(
      plugin('ai', (inner: Context) => inner.provide('accounts', { face: 'accounts' })),
    )
    const consumer = await ctx.plugin(plugin('og', () => {}, ['accounts']))
    expect(consumer.state as number).toBe(FIBER_STATE.ACTIVE)
    expect(ctx.get('accounts')).toBeDefined()

    await provider.dispose()
    expect(ctx.get('accounts')).toBeUndefined()
    expect(consumer.state as number).toBe(FIBER_STATE.PENDING)
  })

  it('两个 provide 之间抛出 ⇒ 第一个也随 fiber 撤掉', async () => {
    const ctx = new Context()
    const fiber = ctx.plugin(
      plugin('half-provider', (inner: Context) => {
        inner.provide('accounts', {})
        throw new Error('second provide failed')
      }),
    )
    await expect(fiber).rejects.toThrow('second provide failed')
    expect(ctx.get('accounts')).toBeUndefined()
  })
})
