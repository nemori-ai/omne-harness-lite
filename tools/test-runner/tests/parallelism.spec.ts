import { describe, expect, it } from 'vitest'
import {
  budgetFor,
  machineCapacity,
  memberDemand,
  tokensPerWorker,
  workersFor,
  type ParallelPolicy,
} from '../src/testing/parallelism.ts'

const POLICY: ParallelPolicy = {
  maxWorkersPerMember: 8,
  reserveCores: 2,
  tokensPerWorker: [{ member: 'apps/server', tier: 'slow', tokens: 2, why: '量过' }],
}

describe('整机的令牌数', () => {
  it('核数减留下的核，至少 1', () => {
    expect(machineCapacity(POLICY, 8)).toBe(6)
    expect(machineCapacity(POLICY, 24)).toBe(22)
    expect(machineCapacity(POLICY, 2)).toBe(1)
    expect(machineCapacity(POLICY, 1)).toBe(1)
  })
})

describe('这一件活的预算', () => {
  it('OMNE_WORKER_BUDGET 已设时以它为准，不超过核数；不是正整数就报错；没设时取整机容量', () => {
    expect(budgetFor(POLICY, { OMNE_WORKER_BUDGET: '3' }, 8)).toEqual({
      workers: 3,
      cores: 8,
      source: 'env',
    })
    expect(budgetFor(POLICY, { OMNE_WORKER_BUDGET: '100000' }, 8).workers).toBe(8)
    expect(() => budgetFor(POLICY, { OMNE_WORKER_BUDGET: 'many' }, 8)).toThrow('OMNE_WORKER_BUDGET')
    expect(budgetFor(POLICY, {}, 8)).toEqual({ workers: 6, cores: 8, source: 'capacity' })
  })
})

describe('一个成员一层要多少令牌', () => {
  it('每个进程要的令牌数：表里有的取表，没有的是 1', () => {
    expect(tokensPerWorker(POLICY, 'apps/server', 'slow')).toBe(2)
    expect(tokensPerWorker(POLICY, 'apps/server', 'fast')).toBe(1)
    expect(tokensPerWorker(POLICY, 'packages/x', 'slow')).toBe(1)
  })

  it('want = min(每成员进程上限, 文件数) × 每个进程要的令牌数；文件数不知道按上限；min 够起一个进程', () => {
    expect(memberDemand(POLICY, 'packages/x', 'fast', 3)).toEqual({ want: 3, min: 1, perWorker: 1 })
    expect(memberDemand(POLICY, 'packages/x', 'fast', 50)).toEqual({
      want: 8,
      min: 1,
      perWorker: 1,
    })
    expect(memberDemand(POLICY, 'packages/x', 'fast', undefined).want).toBe(8)
    expect(memberDemand(POLICY, 'packages/x', 'fast', 0).want).toBe(1)
    expect(memberDemand(POLICY, 'apps/server', 'slow', 3)).toEqual({
      want: 6,
      min: 2,
      perWorker: 2,
    })
    const half: ParallelPolicy = {
      ...POLICY,
      tokensPerWorker: [{ member: 'a', tier: 'fast', tokens: 1.5, why: '量过' }],
    }
    expect(memberDemand(half, 'a', 'fast', 3)).toEqual({ want: 5, min: 2, perWorker: 1.5 })
  })

  it('拿到的令牌变成进程数：令牌数 ÷ 每个进程要的令牌数，向下取整，至少 1', () => {
    expect(workersFor(6, 1)).toBe(6)
    expect(workersFor(5, 2)).toBe(2)
    expect(workersFor(4, 1.5)).toBe(2)
    expect(workersFor(1, 2)).toBe(1)
  })
})
