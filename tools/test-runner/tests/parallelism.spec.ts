// 并行度从机器推的规则：预算怎么来、怎么分。池子是核数减去留给别的活的核，按同一台机器同时跑几次检查平分。
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readTestRunsConfig } from '../src/testing/config.ts'
import {
  budgetFor,
  deriveParallelism,
  idleBetween,
  observeMachine,
  workerBudget,
  type ParallelPolicy,
} from '../src/testing/parallelism.ts'

const POLICY: ParallelPolicy = {
  memberDivisor: 3,
  workerDivisor: 4,
  maxWorkersPerMember: 8,
  minimum: 2,
  memoryPerWorkerMiB: 512,
  sampleMs: 0,
  reserveCores: 2,
  concurrentRuns: 2,
}

const machine = (cores: number, idleFraction = 1, freeMemoryMiB = 64 * 1024) => ({
  cores,
  idleFraction,
  freeMemoryMiB,
})

describe('工作进程预算', () => {
  it('池子是核数减去留下的核，按同时跑的次数平分，向下取整', () => {
    expect(workerBudget(machine(24), POLICY).workers).toBe(11)
    expect(workerBudget(machine(8), POLICY).workers).toBe(3)
    expect(workerBudget(machine(9), POLICY).workers).toBe(3)
  })

  it('不看空闲率：另一次检查在跑时，这一次拿到的预算不变', () => {
    expect(workerBudget(machine(8, 0.01), POLICY).workers).toBe(3)
    expect(workerBudget(machine(24, 0.5), POLICY).workers).toBe(11)
  })

  it('只按一次检查分、不留核时，预算就是核数', () => {
    const whole = { ...POLICY, reserveCores: 0, concurrentRuns: 1 }
    expect(workerBudget(machine(8), whole).workers).toBe(8)
  })

  it('空闲内存不够时按每进程内存封顶', () => {
    expect(workerBudget(machine(24, 1, 6 * 512), POLICY).workers).toBe(6)
  })

  it('至少 1：核数不比留下的多时也不为 0', () => {
    expect(workerBudget(machine(2), POLICY).workers).toBe(1)
    expect(workerBudget(machine(1), POLICY).workers).toBe(1)
    expect(workerBudget(machine(4, 1, 1024 * 1024), POLICY).workers).toBe(1)
  })

  it('空闲内存读不到（0）时不按内存封顶', () => {
    expect(workerBudget(machine(8, 1, 0), POLICY).workers).toBe(3)
  })
})

describe('预算怎么分', () => {
  it('24 核机器：预算 11，4 个成员并行、每个至多 3 个进程', () => {
    expect(deriveParallelism(workerBudget(machine(24), POLICY), POLICY)).toEqual({
      memberConcurrency: 4,
      vitestMaxWorkers: 3,
    })
  })

  it('8 核机器：预算 3，按下限 2 × 2', () => {
    expect(deriveParallelism(workerBudget(machine(8), POLICY), POLICY)).toEqual({
      memberConcurrency: 2,
      vitestMaxWorkers: 2,
    })
  })

  it('小机器不低于下限，大机器每成员进程不超过上限', () => {
    expect(deriveParallelism(workerBudget(machine(2), POLICY), POLICY)).toEqual({
      memberConcurrency: 2,
      vitestMaxWorkers: 2,
    })
    expect(deriveParallelism(workerBudget(machine(64), POLICY), POLICY)).toEqual({
      memberConcurrency: 11,
      vitestMaxWorkers: 8,
    })
  })
})

describe('空闲率', () => {
  const sample = (idle: number, user: number) => [{ times: { idle, user, sys: 0 } }]

  it('按两次采样之间的时间差算，不按累计值', () => {
    expect(idleBetween(sample(900, 100), sample(950, 150))).toBe(0.5)
    expect(idleBetween(sample(0, 0), sample(100, 0))).toBe(1)
    expect(idleBetween(sample(0, 0), sample(0, 100))).toBe(0)
  })

  it('没有核或时间没走时当全闲', () => {
    expect(idleBetween([], [])).toBe(1)
    expect(idleBetween(sample(10, 10), sample(10, 10))).toBe(1)
  })
})

describe('调用方交下来的预算', () => {
  it('OMNE_WORKER_BUDGET 已设时以它为准，不超过核数；不是正整数就报错', async () => {
    const given = await budgetFor({ ...POLICY, sampleMs: 0 }, { OMNE_WORKER_BUDGET: '3' })
    expect(given.workers).toBe(3)
    expect(given.source).toBe('env')
    const capped = await budgetFor({ ...POLICY, sampleMs: 0 }, { OMNE_WORKER_BUDGET: '100000' })
    expect(capped.workers).toBe(capped.machine.cores)
    await expect(budgetFor(POLICY, { OMNE_WORKER_BUDGET: 'many' })).rejects.toThrow(
      'OMNE_WORKER_BUDGET',
    )
    expect((await budgetFor({ ...POLICY, sampleMs: 0 }, {})).source).toBe('sampled')
  })
})

describe('名额数与池子的分法是同一个数', () => {
  it('运行名额的缺省个数等于配置里按几次检查同时跑来分池子', () => {
    const script = readFileSync(
      fileURLToPath(new URL('../../../scripts/with-test-slot.mjs', import.meta.url)),
      'utf8',
    )
    const initial = /env: 'OMNE_TEST_SLOTS', initial: '(\d+)'/u.exec(script)?.[1]
    expect(initial).toBe(String(readTestRunsConfig().parallel.concurrentRuns))
  })
})

describe('看机器', () => {
  it('核数至少 1，空闲率在 0 到 1 之间，空闲内存为非负整数', async () => {
    const seen = await observeMachine(20)
    expect(seen.cores).toBeGreaterThanOrEqual(1)
    expect(seen.idleFraction).toBeGreaterThanOrEqual(0)
    expect(seen.idleFraction).toBeLessThanOrEqual(1)
    expect(Number.isInteger(seen.freeMemoryMiB) && seen.freeMemoryMiB >= 0).toBe(true)
  })
})
