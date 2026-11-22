import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { plugin } from './basis-support.ts'
import { StatusProbe, probeOf, settle } from './status-probe-support.ts'

const about = (log: readonly string[], name: string): string[] =>
  log.filter(line => /^(place|take)/.test(line) || line.startsWith(`status ${name}`))

describe('unloading-status-precedes-effect-disposal', () => {
  it('卸载：ACTIVE->UNLOADING 的状态事件先于效应被撤，效应倒序撤', async () => {
    const ctx = new Context()
    await ctx.plugin(StatusProbe)
    const probe = probeOf(ctx)
    const fiber = await ctx.plugin(
      plugin(
        'mod',
        (inner: Context) => {
          probeOf(inner).place('one')
          probeOf(inner).place('two')
        },
        ['statusProbe'],
      ),
    )
    probe.log.length = 0
    await fiber.dispose()
    await settle()
    expect(about(probe.log, 'mod').slice(0, 3)).toEqual([
      'status mod ACTIVE->UNLOADING',
      'take two',
      'take one',
    ])
  })

  it('apply 抛错：从没到过 ACTIVE，LOADING->UNLOADING 先于效应被撤', async () => {
    const ctx = new Context()
    await ctx.plugin(StatusProbe)
    const probe = probeOf(ctx)
    const fiber = ctx.plugin(
      plugin(
        'bad',
        (inner: Context) => {
          probeOf(inner).place('one')
          throw new Error('boom')
        },
        ['statusProbe'],
      ),
    )
    await expect(fiber).rejects.toThrow('boom')
    await settle()
    expect(about(probe.log, 'bad')).toEqual([
      'status bad PENDING->LOADING',
      'place one',
      'status bad LOADING->UNLOADING',
      'take one',
      'status bad UNLOADING->FAILED',
    ])
  })
})
