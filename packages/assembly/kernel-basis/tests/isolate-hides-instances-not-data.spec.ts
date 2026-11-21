import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { plugin } from './basis-support.ts'

describe('isolate-hides-instances-not-data', () => {
  it('子 isolate 里按名取得读不到父标签的服务；属性解析却回退到祖先已注入的那一份', async () => {
    const ctx = new Context()
    const observed: string[] = []
    const provider = await ctx.plugin(
      plugin('parent-provider', inner => inner.provide('scoped', 'parent-instance')),
    )
    const parent = ctx.plugin(
      plugin(
        'parent-consumer',
        async inner => {
          expect(Reflect.get(inner, 'scoped')).toBe('parent-instance')
          observed.push('parent')
          await inner.plugin(
            plugin('same-label-child', child => {
              expect(Reflect.get(child, 'scoped')).toBe('parent-instance')
              observed.push('same-label-child')
            }),
          )
          await inner.isolate('scoped').plugin(
            plugin('isolated-child', child => {
              expect(Reflect.get(child, 'scoped')).toBe('parent-instance')
              expect(child.get('scoped')).toBeUndefined()
              expect(child.get('scoped', false)).toBeUndefined()
              observed.push('isolated-child')
            }),
          )
        },
        ['scoped'],
      ),
    )
    try {
      await parent
      expect(observed).toEqual(['parent', 'same-label-child', 'isolated-child'])
      expect(ctx.get('scoped')).toBe('parent-instance')
    } finally {
      await parent.dispose()
      await provider.dispose()
    }
  })

  it('子 isolate 里有自己的提供者：inject 与按名取得读到它，没 inject 的属性解析仍读到祖先那一份', async () => {
    const ctx = new Context()
    const seen: Record<string, unknown> = {}
    await ctx.plugin(plugin('parent-provider', inner => inner.provide('scoped', 'parent-instance')))
    await ctx.plugin(
      plugin(
        'parent-consumer',
        async inner => {
          const scope = inner.isolate('scoped')
          await scope.plugin(
            plugin('isolated-provider', child => child.provide('scoped', 'isolated-instance')),
          )
          await scope.plugin(
            plugin(
              'injecting-child',
              child => {
                seen['injected property'] = Reflect.get(child, 'scoped')
                seen['injected get'] = child.get('scoped')
              },
              ['scoped'],
            ),
          )
          await scope.plugin(
            plugin('plain-child', child => {
              seen['plain property'] = Reflect.get(child, 'scoped')
              seen['plain get'] = child.get('scoped')
            }),
          )
        },
        ['scoped'],
      ),
    )
    expect(seen).toEqual({
      'injected property': 'isolated-instance',
      'injected get': 'isolated-instance',
      'plain property': 'parent-instance',
      'plain get': 'isolated-instance',
    })
  })

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
    expect(labelInA).toBe('A')
    expect(seenFromA).toBe('visible')
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
