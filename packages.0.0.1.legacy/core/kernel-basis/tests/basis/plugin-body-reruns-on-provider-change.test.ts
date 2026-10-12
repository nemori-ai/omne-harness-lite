// basis: plugin-body-reruns-on-provider-change（@deepseek-ai/cordis 4.0.4）
// 断言：必需服务换提供者 ⇒ 消费者插件体重跑；同一提供者实例内部状态变化 ⇒ 不重跑。
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { plugin } from './support.ts'

describe('plugin-body-reruns-on-provider-change', () => {
  it('换提供者重跑，同实例状态变化不重跑', async () => {
    const ctx = new Context()
    let runs = 0
    const consumer = plugin(
      'consumer',
      (inner: Context) => {
        runs += 1
        void inner
      },
      ['svc'],
    )
    await ctx.plugin(consumer)
    expect(runs).toBe(0) // 提供者不在：PENDING，插件体未跑

    const state = { counter: 0 }
    const providerA = plugin('providerA', (inner: Context) => inner.provide('svc', state))
    const fiberA = await ctx.plugin(providerA)
    expect(runs).toBe(1)

    state.counter += 1 // 同一实例内部变化
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(runs).toBe(1)

    await fiberA.dispose() // 提供者离开 ⇒ 消费者卸载
    const providerB = plugin('providerB', (inner: Context) => inner.provide('svc', { counter: 0 }))
    await ctx.plugin(providerB)
    expect(runs).toBe(2) // 换代 ⇒ 插件体重跑
  })
})
