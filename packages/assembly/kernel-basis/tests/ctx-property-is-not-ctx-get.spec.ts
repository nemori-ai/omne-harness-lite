import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { plugin } from './basis-support.ts'

describe('ctx-property-is-not-ctx-get', () => {
  it('没 inject ⇒ ctx.<键> 抛错，ctx.get 照样取到', async () => {
    const ctx = new Context()
    const store = { owner: 'provider' }
    await ctx.plugin(plugin('provider', (inner: Context) => inner.provide('probeKv', store)))
    let viaProperty: unknown
    let viaGet: unknown
    await ctx.plugin(
      plugin('undeclared', (inner: Context) => {
        viaGet = inner.get('probeKv')
        try {
          viaProperty = (inner as unknown as Record<string, unknown>).probeKv
        } catch (error) {
          viaProperty = error
        }
      }),
    )
    expect(viaGet).toEqual(store)
    expect(viaProperty).toBeInstanceOf(Error)
    expect((viaProperty as Error).message).toMatch(/probeKv/)
  })

  it('inject 了 ⇒ ctx.<键> 取得到', async () => {
    const ctx = new Context()
    const store = { owner: 'provider' }
    await ctx.plugin(plugin('provider', (inner: Context) => inner.provide('probeKv', store)))
    let viaProperty: unknown
    await ctx.plugin(
      plugin(
        'declared',
        (inner: Context) => {
          viaProperty = (inner as unknown as Record<string, unknown>).probeKv
        },
        ['probeKv'],
      ),
    )
    expect(viaProperty).toEqual(store)
  })
})
