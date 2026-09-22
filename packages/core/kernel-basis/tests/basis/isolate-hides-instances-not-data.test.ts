// basis: isolate-hides-instances-not-data（@deepseek-ai/cordis 4.0.4）
// 断言：两个 isolate 标签下的两个服务实例共享同一数据句柄时，从标签 A 的实例读得到「属于 B」的数据——
// isolate 隔离的是实例可见性，不是数据。另断言：同标签重复 provide 抛错；同 label 两次 isolate 合流。
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { plugin } from './support.ts'

describe('isolate-hides-instances-not-data', () => {
  it('隔离不及于数据', async () => {
    const ctx = new Context()
    const shared = new Map<string, string>()
    const makeProvider = (label: string) =>
      plugin(`provider-${label}`, (inner: Context) => {
        inner.provide('store', {
          label,
          write: (k: string, v: string) => shared.set(k, v),
          read: (k: string) => shared.get(k),
        })
      })
    const ctxA = ctx.isolate('store')
    const ctxB = ctx.isolate('store')
    await ctxA.plugin(makeProvider('A'))
    await ctxB.plugin(makeProvider('B'))

    let seenFromA: string | undefined
    let labelInA: string | undefined
    await ctxA.plugin(
      plugin(
        'consumer-A',
        (inner: Context) => {
          const store = inner.get('store') as { label: string; write: Function; read: Function }
          labelInA = store.label
          store.write('tenant-b-secret', 'visible')
          seenFromA = store.read('tenant-b-secret') as string | undefined
        },
        ['store'],
      ),
    )
    expect(labelInA).toBe('A') // 解析到的是本标签的实例
    expect(seenFromA).toBe('visible') // 但数据句柄是共享的：隔离没有发生在数据层
  })

  it('同标签重复 provide 抛错；同 label 的两次 isolate 合流', async () => {
    const ctx = new Context()
    await ctx.plugin(plugin('first', (inner: Context) => inner.provide('dup', 1)))
    const second = ctx.plugin(plugin('second', (inner: Context) => inner.provide('dup', 2)))
    await expect(second).rejects.toThrow(/has been registered/)

    const label = Symbol('shared-label')
    const c1 = ctx.isolate('joined', label)
    const c2 = ctx.isolate('joined', label)
    await c1.plugin(plugin('p1', (inner: Context) => inner.provide('joined', 'one')))
    let seen: unknown
    await c2.plugin(
      plugin(
        'c2',
        (inner: Context) => {
          seen = inner.get('joined')
        },
        ['joined'],
      ),
    )
    expect(seen).toBe('one')
  })
})
