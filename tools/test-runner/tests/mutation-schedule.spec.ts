// 成员之间并行：工作进程的分法与按预算调度（schedule.ts）。真起 Stryker 的多成员运行见 mutation-stryker-incremental.spec.ts。
import { describe, expect, it } from 'vitest'
import { allocateWorkers, runWithinBudget } from '../src/mutation/schedule.ts'

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0)

describe('分工作进程', () => {
  it('按工作量成比例分，合起来正好是预算，每个至少一个', () => {
    expect(
      allocateWorkers(16, [
        { weight: 3, cap: 16 },
        { weight: 1, cap: 16 },
      ]),
    ).toEqual([12, 4])
    expect(
      allocateWorkers(10, [
        { weight: 1, cap: 10 },
        { weight: 1, cap: 10 },
        { weight: 1, cap: 10 },
      ]),
    ).toEqual([4, 3, 3])
    expect(
      allocateWorkers(3, [
        { weight: 100, cap: 3 },
        { weight: 0, cap: 3 },
        { weight: 0, cap: 3 },
      ]),
    ).toEqual([1, 1, 1])
  })

  it('封顶的成员只拿到上限，多出来的给没封顶的；都封顶时剩下的不分', () => {
    expect(
      allocateWorkers(16, [
        { weight: 1, cap: 2 },
        { weight: 1, cap: 16 },
      ]),
    ).toEqual([2, 14])
    expect(
      allocateWorkers(16, [
        { weight: 5, cap: 3 },
        { weight: 1, cap: 4 },
      ]),
    ).toEqual([3, 4])
  })

  it('权重全为 0 时平分；结果只由输入决定', () => {
    const members = [
      { weight: 0, cap: 20 },
      { weight: 0, cap: 20 },
    ]
    expect(allocateWorkers(7, members)).toEqual([4, 3])
    expect(allocateWorkers(7, members)).toEqual(allocateWorkers(7, members))
  })

  it('任意输入下都不超过预算、不超过上限、每个至少一个', () => {
    for (let budget = 1; budget <= 24; budget += 1)
      for (let count = 1; count <= Math.min(budget, 6); count += 1) {
        const members = Array.from({ length: count }, (_, index) => ({
          weight: (index * 7 + budget) % 5,
          cap: ((index * 3 + budget) % 9) + 1,
        }))
        const shares = allocateWorkers(budget, members)
        expect(sum(shares)).toBeLessThanOrEqual(budget)
        for (const [index, share] of shares.entries()) {
          expect(share).toBeGreaterThanOrEqual(1)
          expect(share).toBeLessThanOrEqual(Math.max(1, members[index]?.cap ?? 1))
        }
      }
  })
})

/** 一个能从外面放行的运行：记下同时在跑的工作进程数的最大值。 */
function harness() {
  const gates = new Map<number, () => void>()
  const started: [number, number][] = []
  let busy = 0
  let peak = 0
  const run = (index: number, workers: number) =>
    new Promise<string>(resolve => {
      started.push([index, workers])
      busy += workers
      peak = Math.max(peak, busy)
      gates.set(index, () => {
        busy -= workers
        resolve(`member-${index}`)
      })
    })
  const settle = () => new Promise(resolve => setTimeout(resolve, 0))
  const release = async (index: number) => {
    gates.get(index)?.()
    await settle()
  }
  return { run, started, release, settle, peak: () => peak }
}

describe('按预算调度', () => {
  it('同时在跑的工作进程不超过预算；跑完的成员把进程还回去，排着的接着开始', async () => {
    const h = harness()
    const works = [4, 3, 2, 1].map(weight => ({ weight, cap: 8 }))
    const done = runWithinBudget(2, works, [0, 1, 2, 3], h.run)
    await h.settle()
    expect(h.started).toEqual([
      [0, 1],
      [1, 1],
    ])
    await h.release(1)
    expect(h.started.at(-1)).toEqual([2, 1])
    await h.release(0)
    expect(h.started.at(-1)).toEqual([3, 1])
    await h.release(3)
    await h.release(2)
    // 结果按成员的下标放回，与跑完的先后无关。
    await expect(done).resolves.toEqual(['member-0', 'member-1', 'member-2', 'member-3'])
    expect(h.peak()).toBeLessThanOrEqual(2)
  })

  it('成员少于预算时一起开始，按工作量分进程；先开始的按给定的先后', async () => {
    const h = harness()
    const done = runWithinBudget(
      12,
      [
        { weight: 1, cap: 12 },
        { weight: 2, cap: 12 },
      ],
      [1, 0],
      h.run,
    )
    await h.settle()
    expect(h.started).toEqual([
      [1, 8],
      [0, 4],
    ])
    await h.release(0)
    await h.release(1)
    await expect(done).resolves.toEqual(['member-0', 'member-1'])
  })

  it('一个成员抛错：已开始的照样等完，排着的不再开始，错误原样抛出', async () => {
    const started: number[] = []
    const done = runWithinBudget(
      1,
      [0, 1, 2].map(() => ({ weight: 1, cap: 1 })),
      [0, 1, 2],
      async index => {
        started.push(index)
        if (index === 0) throw new Error('boom')
        return index
      },
    )
    await expect(done).rejects.toThrow('boom')
    expect(started).toEqual([0])
  })
})
