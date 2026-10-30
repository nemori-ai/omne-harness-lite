// 覆盖率跨成员并行的并发度：两数之积不超过预算，每成员工作进程数按并行策略分。
import { describe, expect, it } from 'vitest'
import { coverageParallelism } from '../src/testing/coverage-parallel.ts'
import type { Budget, ParallelPolicy } from '../src/testing/parallelism.ts'

const POLICY: ParallelPolicy = {
  memberDivisor: 3,
  workerDivisor: 4,
  maxWorkersPerMember: 8,
  minimum: 2,
  memoryPerWorkerMiB: 512,
  sampleMs: 0,
}

const budget = (workers: number, cores = 24): Budget => ({
  workers,
  machine: { cores, idleFraction: 1, freeMemoryMiB: 64 * 1024 },
  source: 'env',
})

describe('覆盖率并发度', () => {
  it('两个校验点：24 核空闲 0.8（预算 19）给 3x5，满预算 24 给 4x6', () => {
    expect(coverageParallelism(budget(19), POLICY)).toEqual({ members: 3, workers: 5 })
    expect(coverageParallelism(budget(24), POLICY)).toEqual({ members: 4, workers: 6 })
  })

  it('任何预算下两数之积都不超过预算，两数都至少 1', () => {
    for (let workers = 1; workers <= 64; workers += 1) {
      const split = coverageParallelism(budget(workers, 64), POLICY)
      expect(split.members * split.workers, `预算 ${workers}`).toBeLessThanOrEqual(workers)
      expect(split.members).toBeGreaterThanOrEqual(1)
      expect(split.workers).toBeGreaterThanOrEqual(1)
    }
  })

  it('预算小于策略的下限时，每成员工作进程数退到预算本身，只跑一个成员', () => {
    expect(coverageParallelism(budget(1), POLICY)).toEqual({ members: 1, workers: 1 })
    expect(coverageParallelism(budget(3), POLICY)).toEqual({ members: 1, workers: 2 })
  })

  it('每成员工作进程数不超过策略的上限', () => {
    expect(coverageParallelism(budget(64, 64), POLICY)).toEqual({ members: 8, workers: 8 })
  })
})
