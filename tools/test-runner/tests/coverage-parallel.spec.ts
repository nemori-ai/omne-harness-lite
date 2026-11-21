import { describe, expect, it } from 'vitest'
import { coverageParallelism } from '../src/testing/coverage-parallel.ts'
import type { Budget, ParallelPolicy } from '../src/testing/parallelism.ts'

const POLICY: ParallelPolicy = {
  maxWorkersPerMember: 8,
  reserveCores: 2,
  tokensPerWorker: [],
  weight: { floor: 0.5, ceiling: 4, readings: 3, minProcessSeconds: 5 },
  batchSeconds: 90,
  startupShare: 0.05,
}

const budget = (workers: number, cores = 24): Budget => ({ workers, cores, source: 'env' })

describe('覆盖率并发度', () => {
  it('两个校验点：预算 19 给 4x4，满预算 24 给 6x4', () => {
    expect(coverageParallelism(budget(19), POLICY)).toEqual({ members: 4, workers: 4 })
    expect(coverageParallelism(budget(24), POLICY)).toEqual({ members: 6, workers: 4 })
  })

  it('任何预算下两数之积都不超过预算，两数都至少 1', () => {
    for (let workers = 1; workers <= 64; workers += 1) {
      const split = coverageParallelism(budget(workers, 64), POLICY)
      expect(split.members * split.workers, `预算 ${workers}`).toBeLessThanOrEqual(workers)
      expect(split.members).toBeGreaterThanOrEqual(1)
      expect(split.workers).toBeGreaterThanOrEqual(1)
    }
  })

  it('预算很小时每成员一个进程，成员数等于预算', () => {
    expect(coverageParallelism(budget(1), POLICY)).toEqual({ members: 1, workers: 1 })
    expect(coverageParallelism(budget(3), POLICY)).toEqual({ members: 3, workers: 1 })
  })

  it('每成员工作进程数不超过策略的上限', () => {
    expect(coverageParallelism(budget(64, 64), POLICY)).toEqual({ members: 8, workers: 8 })
    expect(coverageParallelism(budget(100, 128), POLICY)).toEqual({ members: 12, workers: 8 })
  })
})
