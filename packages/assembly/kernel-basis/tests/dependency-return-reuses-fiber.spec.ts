import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { FIBER_STATE, plugin } from './basis-support.ts'
import { StatusProbe, probeOf, settle } from './status-probe-support.ts'

describe('dependency-return-reuses-fiber', () => {
  it('依赖丢了再回来：同一个 fiber 对象、同一个 uid 重跑 apply，中间回到 PENDING', async () => {
    const ctx = new Context()
    await ctx.plugin(StatusProbe)
    const probe = probeOf(ctx)
    const dep = plugin('dep', (inner: Context) => inner.provide('dep', {}))
    const seen: unknown[] = []
    const first = await ctx.plugin(dep)
    const fiber = await ctx.plugin(
      plugin(
        'mod',
        (inner: Context) => {
          seen.push(inner.fiber)
          probeOf(inner).place('one')
        },
        ['statusProbe', 'dep'],
      ),
    )
    const uid = fiber.uid
    probe.log.length = 0

    await first.dispose()
    await settle()
    expect(fiber.state as number).toBe(FIBER_STATE.PENDING)
    await ctx.plugin(dep)
    await settle()

    expect(fiber.state as number).toBe(FIBER_STATE.ACTIVE)
    expect(fiber.uid).toBe(uid)
    expect(seen).toHaveLength(2)
    expect(seen[1]).toBe(seen[0])
    expect(
      probe.log.filter(line => /^(place|take)/.test(line) || line.startsWith('status mod')),
    ).toEqual([
      'status mod ACTIVE->UNLOADING',
      'take one',
      'status mod UNLOADING->PENDING',
      'status mod PENDING->LOADING',
      'place one',
      'status mod LOADING->ACTIVE',
    ])
  })

  it('同一个插件对象装两次是两个 fiber，名字相同', async () => {
    const ctx = new Context()
    const twin = plugin('twin', () => {})
    const one = await ctx.plugin(twin)
    const two = await ctx.plugin(twin)
    expect(one).not.toBe(two)
    expect(one.name).toBe('twin')
    expect(two.name).toBe('twin')
  })
})
