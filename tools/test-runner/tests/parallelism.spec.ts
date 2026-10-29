// 并行度从机器推的规则：预算怎么来、怎么分。两个校验点是量过的机器：24 核（空闲 0.8）与 8 核。
import { describe, expect, it } from 'vitest'
import {
  deriveParallelism,
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
}

const machine = (cores: number, idleFraction = 1, freeMemoryMiB = 64 * 1024) => ({
  cores,
  idleFraction,
  freeMemoryMiB,
})

describe('工作进程预算', () => {
  it('核数乘空闲率，向下取整', () => {
    expect(workerBudget(machine(24, 0.82), POLICY).workers).toBe(19)
    expect(workerBudget(machine(8, 1), POLICY).workers).toBe(8)
  })

  it('空闲内存不够时按每进程内存封顶', () => {
    expect(workerBudget(machine(24, 1, 6 * 512), POLICY).workers).toBe(6)
  })

  it('至少 1、至多核数，机器再忙也不为 0', () => {
    expect(workerBudget(machine(8, 0.01), POLICY).workers).toBe(1)
    expect(workerBudget(machine(4, 1, 1024 * 1024), POLICY).workers).toBe(4)
  })
})

describe('预算怎么分', () => {
  it('24 核空闲 0.8 的机器：7 个成员并行、每个至多 5 个进程（扫描过的平台期）', () => {
    expect(deriveParallelism(workerBudget(machine(24, 0.82), POLICY), POLICY)).toEqual({
      memberConcurrency: 7,
      vitestMaxWorkers: 5,
    })
  })

  it('8 核机器：3 × 2，与在 8 核上量到 2 × 4 与 4 × 2 相当一致', () => {
    expect(deriveParallelism(workerBudget(machine(8), POLICY), POLICY)).toEqual({
      memberConcurrency: 3,
      vitestMaxWorkers: 2,
    })
  })

  it('小机器不低于下限，大机器每成员进程不超过上限', () => {
    expect(deriveParallelism(workerBudget(machine(2), POLICY), POLICY)).toEqual({
      memberConcurrency: 2,
      vitestMaxWorkers: 2,
    })
    expect(deriveParallelism(workerBudget(machine(64), POLICY), POLICY)).toEqual({
      memberConcurrency: 22,
      vitestMaxWorkers: 8,
    })
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
