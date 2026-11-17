import { describe, expect, it } from 'vitest'
import { fastWithSlow, resumeFilesToRun, type TierHooks } from '../src/testing/steps.ts'
import { localPool, runGatedJobs, tierGate, type GatedJob } from '../src/testing/token-pool.ts'

describe('快慢两层的闸门（全化表）', () => {
  it('快层整层没判：这个成员第一次就过了，跑；没过或还没跑完，等', () => {
    const tier = tierGate()
    tier.done('a', 0)
    tier.done('b', 1)
    expect(tier.gate.state('a')).toBe('run')
    expect(tier.gate.state('b')).toBe('wait')
    expect(tier.gate.state('c')).toBe('wait')
  })

  it('快层整层判通过（定向重跑之后也算）：每个成员都跑', () => {
    const tier = tierGate()
    tier.done('b', 1)
    tier.settle(0)
    expect(tier.gate.state('b')).toBe('run')
    expect(tier.gate.state('c')).toBe('run')
  })

  it('快层整层判没过：每个成员都跳过，第一次就过了的成员也一样；判过之后不再改', () => {
    const tier = tierGate()
    tier.done('a', 0)
    tier.settle(1)
    tier.settle(0)
    expect(tier.gate.state('a')).toBe('skip')
    expect(tier.gate.state('c')).toBe('skip')
  })

  it('状态一变就叫醒在等的派批', async () => {
    const tier = tierGate()
    const woken = tier.gate.changed()
    tier.done('a', 0)
    await expect(woken).resolves.toBeUndefined()
  })
})

describe('带闸门的派批', () => {
  const job = (member: string, log: string[], label = member): GatedJob<string> => ({
    member,
    want: 1,
    min: 1,
    label,
    run: async () => {
      log.push(`run ${label}`)
      return label
    },
  })

  it('挑队里最靠前的、闸门放行的一批先跑，不让前面在等的堵住后面放行的', async () => {
    const tier = tierGate()
    const log: string[] = []
    tier.done('b', 0)
    const done = runGatedJobs(
      [job('a', log), job('b', log)],
      localPool(1),
      tier.gate,
      () => 'skipped',
    )
    await new Promise(resolve => setImmediate(resolve))
    expect(log).toEqual(['run b'])
    tier.done('a', 0)
    expect(await done).toEqual(['b', 'a'])
  })

  it('闸门判跳过的批不跑，交给跳过的处理', async () => {
    const tier = tierGate()
    const log: string[] = []
    tier.settle(1)
    const skipped: string[] = []
    expect(
      await runGatedJobs([job('a', log)], localPool(1), tier.gate, entry => {
        skipped.push(entry.label)
        return 'skipped'
      }),
    ).toEqual(['skipped'])
    expect(log).toEqual([])
    expect(skipped).toEqual(['a'])
  })

  it('等令牌的时候快层判了没过：拿到令牌后不跑，还回令牌', async () => {
    const tier = tierGate()
    tier.done('a', 0)
    const pool = localPool(1)
    const held = await pool.acquire({ want: 1, min: 1, label: 'other' })
    const log: string[] = []
    const done = runGatedJobs([job('a', log)], pool, tier.gate, () => 'skipped')
    await new Promise(resolve => setImmediate(resolve))
    tier.settle(1)
    await held.release()
    expect(await done).toEqual(['skipped'])
    expect(log).toEqual([])
    const again = await pool.acquire({ want: 1, min: 1, label: 'after' })
    expect(again.tokens).toBe(1)
    await again.release()
  })
})

describe('快慢两层同时起', () => {
  function recorder(codes: Readonly<Record<'fast' | 'slow', number>>, members: readonly string[]) {
    const ran: string[] = []
    const notes: string[] = []
    let releaseFast = () => {}
    const fastHeld = new Promise<void>(resolve => {
      releaseFast = resolve
    })
    const run = async (tier: 'fast' | 'slow', hooks: TierHooks) => {
      if (tier === 'fast') {
        for (const member of members) {
          ran.push(`fast ${member}`)
          hooks.onMember?.(member, codes.fast)
        }
        await fastHeld
        return codes.fast
      }
      const gate = hooks.gate
      if (gate === undefined) throw new Error('慢层要有闸门')
      await runGatedJobs(
        members.map(member => ({
          member,
          want: 1,
          min: 1,
          label: member,
          run: async () => {
            ran.push(`slow ${member}`)
          },
        })),
        localPool(1),
        gate,
        entry => {
          ran.push(`skip ${entry.member}`)
        },
      )
      return codes.slow
    }
    return { ran, notes, run, releaseFast, note: (text: string) => notes.push(text) }
  }

  it('成员的快层过了，它的慢层不等整层快层收尾就开跑；两层都过，这一步通过', async () => {
    const r = recorder({ fast: 0, slow: 0 }, ['a', 'b'])
    const step = fastWithSlow(r.run, r.note)
    await new Promise(resolve => setImmediate(resolve))
    expect(r.ran).toEqual(['fast a', 'fast b', 'slow a', 'slow b'])
    r.releaseFast()
    expect(await step).toBe(0)
    expect(r.notes).toEqual([])
  })

  it('快层没过：没起的慢层批全跳过，这一步失败，并说明没有再起慢层', async () => {
    const r = recorder({ fast: 1, slow: 0 }, ['a'])
    const step = fastWithSlow(r.run, r.note)
    await new Promise(resolve => setImmediate(resolve))
    expect(r.ran).toEqual(['fast a'])
    r.releaseFast()
    expect(await step).toBe(1)
    expect(r.ran).toEqual(['fast a', 'skip a'])
    expect(r.notes.join('\n')).toContain('没有再起新的慢层批')
  })

  it('快层过了、慢层失败：这一步失败', async () => {
    const r = recorder({ fast: 0, slow: 1 }, ['a'])
    const step = fastWithSlow(r.run, r.note)
    r.releaseFast()
    expect(await step).toBe(1)
  })
})

describe('接续时要单独跑的失败文件', () => {
  it('所在成员这次已整个跑过的不再单独跑，其余照跑', () => {
    const file = (member: string, name: string) => ({
      member,
      file: `${member}/tests/${name}`,
      tier: 'slow' as const,
      kind: 'timeout' as const,
      firstError: 'timed out',
    })
    const files = [file('packages/a', 'x.spec.ts'), file('tools/b', 'y.spec.ts')]
    expect(resumeFilesToRun(files, new Set(['packages/a']))).toEqual([files[1]])
    expect(resumeFilesToRun(files, new Set())).toEqual(files)
  })
})
