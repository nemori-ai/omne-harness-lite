import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { plugin } from './basis-support.ts'
import { StatusProbe, probeOf } from './status-probe-support.ts'

describe('apply-effects-precede-active-status', () => {
  it('apply 里登记的效应先于 LOADING->ACTIVE 的状态事件', async () => {
    const ctx = new Context()
    await ctx.plugin(StatusProbe)
    const probe = probeOf(ctx)
    await ctx.plugin(
      plugin(
        'mod',
        (inner: Context) => {
          probeOf(inner).place('one')
          probeOf(inner).place('two')
        },
        ['statusProbe'],
      ),
    )
    const mine = probe.log.filter(line => line.startsWith('place') || line.startsWith('status mod'))
    expect(mine).toEqual([
      'status mod PENDING->LOADING',
      'place one',
      'place two',
      'status mod LOADING->ACTIVE',
    ])
  })
})
