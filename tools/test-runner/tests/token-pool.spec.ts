// 进程内的令牌池与按令牌跑活：发放规则（队首、min(want, 空闲)、空闲不足 min 不拿）、先来先得、归还，
// 以及检查的每一步要多少令牌。整机令牌池（起子进程）归 token-pool-machine.spec.ts。
import { describe, expect, it } from 'vitest'
import { stepTokens, withTokens } from '../src/testing/check-steps.ts'
import type { CheckStep } from '../src/testing/check-graph.ts'
import { localPool, runJob, runJobs, tokenSource } from '../src/testing/token-pool.ts'

const later = () => new Promise(resolve => setTimeout(resolve, 0))

describe('一件活', () => {
  it('空闲数恰好等于 min 时就拿，拿 min(want, 空闲)；跑完归还，后来者拿到全部', async () => {
    const pool = localPool(3)
    const holder = await pool.acquire({ want: 1, min: 1, label: 'holder' })
    const seen = await runJob({ want: 4, min: 2, label: 'x', run: async tokens => tokens }, pool)
    expect(seen).toBe(2)
    await holder.release()
    expect(await runJob({ want: 3, min: 1, label: 'y', run: async tokens => tokens }, pool)).toBe(3)
  })

  it('跑的时候抛错：照样归还，错误原样抛出', async () => {
    const pool = localPool(1)
    await expect(
      runJob(
        { want: 1, min: 1, label: 'bad', run: async () => Promise.reject(new Error('坏了')) },
        pool,
      ),
    ).rejects.toThrow('坏了')
    expect(
      await runJob({ want: 1, min: 1, label: 'next', run: async tokens => tokens }, pool),
    ).toBe(1)
  })
})

describe('进程内的令牌池', () => {
  it('容量之内整拿；只剩一部分时拿剩下的；归还之后后来者拿到更多', async () => {
    const pool = localPool(4)
    const first = await pool.acquire({ want: 3, min: 1, label: 'a' })
    expect(first.tokens).toBe(3)
    const second = await pool.acquire({ want: 4, min: 1, label: 'b' })
    expect(second.tokens).toBe(1)
    let third: number | undefined
    void pool.acquire({ want: 4, min: 1, label: 'c' }).then(lease => {
      third = lease.tokens
    })
    await later()
    expect(third).toBeUndefined()
    await first.release()
    await later()
    expect(third).toBe(3)
    await first.release()
    await later()
    // 重复归还无害：没有多出令牌。
    expect(
      (await Promise.race([pool.acquire({ want: 1, min: 1, label: 'd' }), later()])) ?? 0,
    ).toBe(0)
  })

  it('先来先得：队首要的 min 不够时，后来者即使要得少也不越过它', async () => {
    const pool = localPool(3)
    const holder = await pool.acquire({ want: 2, min: 1, label: 'holder' })
    const order: string[] = []
    void pool.acquire({ want: 3, min: 3, label: 'big' }).then(() => order.push('big'))
    void pool.acquire({ want: 1, min: 1, label: 'small' }).then(() => order.push('small'))
    await later()
    expect(order).toEqual([])
    await holder.release()
    await later()
    expect(order).toEqual(['big'])
  })

  it('min 大于容量按容量算，不会永远等', async () => {
    const lease = await localPool(2).acquire({ want: 5, min: 5, label: 'x' })
    expect(lease.tokens).toBe(2)
  })

  it('令牌数不是正整数就报错', () => {
    expect(() => localPool(0)).toThrow('正整数')
  })
})

describe('按令牌跑活', () => {
  it('按次序去要令牌，拿到就起；任何时刻在跑的令牌之和不超过容量；结果按原次序', async () => {
    const pool = localPool(4)
    let inUse = 0
    let peak = 0
    const gates: (() => void)[] = []
    const job = (name: string, want: number) => ({
      want,
      min: 1,
      label: name,
      run: async (tokens: number) => {
        inUse += tokens
        peak = Math.max(peak, inUse)
        await new Promise<void>(resolve => gates.push(resolve))
        inUse -= tokens
        return `${name}:${tokens}`
      },
    })
    const done = runJobs([job('a', 3), job('b', 3), job('c', 2)], pool)
    await later()
    expect(gates).toHaveLength(2)
    gates.shift()?.()
    await later()
    await later()
    for (const open of gates.splice(0)) open()
    await later()
    await later()
    for (const open of gates.splice(0)) open()
    expect(await done).toEqual(['a:3', 'b:1', 'c:2'])
    expect(peak).toBeLessThanOrEqual(4)
  })

  it('一件活抛错：照样归还令牌，其余照跑，最后抛出', async () => {
    const pool = localPool(1)
    const ran: string[] = []
    await expect(
      runJobs(
        [
          {
            want: 1,
            min: 1,
            label: 'bad',
            run: async () => {
              throw new Error('坏了')
            },
          },
          {
            want: 1,
            min: 1,
            label: 'good',
            run: async () => {
              ran.push('good')
            },
          },
        ],
        pool,
      ),
    ).rejects.toThrow('坏了')
    expect(ran).toEqual(['good'])
  })
})

describe('令牌从哪来', () => {
  it('已在令牌之内：在进程内分外层拿到的那些；不在：去整机的令牌池', () => {
    expect(
      tokenSource('/r', { OMNE_TEST_SLOT_HELD: '/x', OMNE_WORKER_BUDGET: '3' }, 2, 8).capacity,
    ).toBe(3)
    expect(tokenSource('/r', { OMNE_TEST_SLOT_HELD: '/x' }, 2, 8).capacity).toBe(6)
    expect(tokenSource('/r', {}, 2, 8).capacity).toBe(6)
    expect(tokenSource('/r', { OMNE_TEST_SLOT_CAPACITY: '3' }, 2, 8).capacity).toBe(3)
  })

  it('环境变量只认正整数，多位数照认；认不出的回到整机的算法；持有标记是空串等于没有', () => {
    const held = (budget: string) =>
      tokenSource('/r', { OMNE_TEST_SLOT_HELD: '/x', OMNE_WORKER_BUDGET: budget }, 2, 8).capacity
    expect(held('12')).toBe(12)
    for (const bad of ['3x', 'x3']) expect(held(bad), bad).toBe(6)
    const machine = (capacity: string) =>
      tokenSource('/r', { OMNE_TEST_SLOT_CAPACITY: capacity }, 2, 8).capacity
    expect(machine('12')).toBe(12)
    for (const bad of ['5x', 'x5']) expect(machine(bad), bad).toBe(6)
    expect(
      tokenSource(
        '/r',
        { OMNE_TEST_SLOT_HELD: '', OMNE_WORKER_BUDGET: '3', OMNE_TEST_SLOT_CAPACITY: '5' },
        2,
        8,
      ).capacity,
    ).toBe(5)
  })
})

describe('检查的每一步要多少令牌', () => {
  const step = (name: string): CheckStep => ({
    name,
    command: ['x', name],
    after: [],
    heavy: false,
  })

  it('构建与类型检查最多要整台机器、至少 1 个；pytest 要四分之一台、至少 2；成员测试与验收自己逐件要；其余各 1', () => {
    expect(stepTokens(step('build'), 6)).toEqual({ want: 6, min: 1 })
    expect(stepTokens(step('typecheck'), 6)).toEqual({ want: 6, min: 1 })
    expect(stepTokens(step('python'), 6)).toEqual({ want: 2, min: 1 })
    expect(stepTokens(step('python'), 22)).toEqual({ want: 5, min: 1 })
    expect(stepTokens(step('test'), 6)).toBeUndefined()
    expect(stepTokens(step('acceptance'), 6)).toBeUndefined()
    expect(stepTokens(step('lint:rules'), 6)).toEqual({ want: 1, min: 1 })
  })

  it('要令牌的步骤包上令牌池脚本，命令原样放在 -- 后面；逐件要的步骤不包', () => {
    expect(withTokens(step('check:docs'), 6, '/s.mjs').command).toEqual([
      process.execPath,
      '/s.mjs',
      '--want',
      '1',
      '--min',
      '1',
      '--',
      'x',
      'check:docs',
    ])
    expect(withTokens(step('test'), 6, '/s.mjs').command).toEqual(['x', 'test'])
  })
})
