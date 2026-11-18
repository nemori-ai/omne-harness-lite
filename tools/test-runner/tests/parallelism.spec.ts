import { describe, expect, it } from 'vitest'
import {
  batchTarget,
  budgetFor,
  machineCapacity,
  memberDemand,
  processWeight,
  workersFor,
  type ParallelPolicy,
} from '../src/testing/parallelism.ts'
import { startupOfRun, startupUse, tokenUse, type MemberSpan } from '../src/testing/run.ts'

const POLICY: ParallelPolicy = {
  maxWorkersPerMember: 8,
  reserveCores: 2,
  tokensPerWorker: [{ member: 'apps/server', tier: 'slow', tokens: 2, why: '起始值' }],
  weight: { floor: 0.5, ceiling: 4, readings: 3, minProcessSeconds: 5 },
  batchSeconds: 90,
  startupShare: 0.05,
}

const reading = (cpuSeconds: number, processSeconds: number) => ({ cpuSeconds, processSeconds })

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
    for (const bad of ['4x', 'x4', '0'])
      expect(() => budgetFor(POLICY, { OMNE_WORKER_BUDGET: bad }, 8), bad).toThrow(
        'OMNE_WORKER_BUDGET',
      )
    expect(budgetFor(POLICY, {}, 8)).toEqual({ workers: 6, cores: 8, source: 'capacity' })
    expect(budgetFor(POLICY, { OMNE_WORKER_BUDGET: '' }, 8), '设成空串等于没设').toEqual({
      workers: 6,
      cores: 8,
      source: 'capacity',
    })
  })
})

describe('一个成员一层要多少令牌', () => {
  it('每个进程的令牌数：有读数时取最近几次里「CPU 秒 ÷ 进程秒（活的墙钟 × 进程数）」的最大值，夹在上下限之间', () => {
    expect(processWeight(POLICY, 'packages/x', 'fast', [reading(30, 60)])).toEqual({
      tokens: 0.5,
      source: 'measured',
    })
    expect(
      processWeight(POLICY, 'packages/x', 'fast', [reading(60, 100), reading(130, 100)]),
    ).toEqual({ tokens: 1.3, source: 'measured' })
    expect(processWeight(POLICY, 'packages/x', 'fast', [reading(10, 100)]).tokens).toBe(0.5)
    expect(processWeight(POLICY, 'packages/x', 'fast', [reading(900, 100)]).tokens).toBe(4)
    expect(
      processWeight(POLICY, 'apps/server', 'slow', [reading(120, 100)]),
      '有读数时起始值不再用',
    ).toEqual({ tokens: 1.2, source: 'measured' })
  })

  it('每个进程的令牌数：只看最近的几次；进程秒太短的不算读数', () => {
    const recent = [reading(80, 100), reading(90, 100), reading(70, 100), reading(300, 100)]
    expect(processWeight(POLICY, 'packages/x', 'fast', recent).tokens).toBe(0.9)
    expect(
      processWeight(POLICY, 'packages/x', 'fast', [reading(4, 2), reading(70, 100)]).tokens,
    ).toBe(0.7)
    expect(
      processWeight(POLICY, 'packages/x', 'fast', [reading(15, 5), reading(70, 100)]).tokens,
      '进程秒恰好等于下限的算读数',
    ).toBe(3)
  })

  it('每个进程的令牌数：没有读数时取配置的起始值，再没有就是 1', () => {
    expect(processWeight(POLICY, 'apps/server', 'slow', [])).toEqual({ tokens: 2, source: 'seed' })
    expect(processWeight(POLICY, 'apps/server', 'slow', [reading(4, 2)])).toEqual({
      tokens: 2,
      source: 'seed',
    })
    expect(processWeight(POLICY, 'apps/server', 'fast', [])).toEqual({
      tokens: 1,
      source: 'default',
    })
    expect(processWeight(POLICY, 'apps/other', 'slow', []), '起始值按成员认').toEqual({
      tokens: 1,
      source: 'default',
    })
  })

  it('want = min(每成员进程上限, 文件数) × 每个进程的令牌数，向上取整；文件数不知道按上限；min 够起一个进程', () => {
    expect(memberDemand(POLICY, 'packages/x', 'fast', 3)).toEqual({
      want: 3,
      min: 1,
      perWorker: 1,
      weightSource: 'default',
    })
    expect(memberDemand(POLICY, 'packages/x', 'fast', 50).want).toBe(8)
    expect(memberDemand(POLICY, 'packages/x', 'fast', undefined).want).toBe(8)
    expect(memberDemand(POLICY, 'packages/x', 'fast', 0).want).toBe(1)
    expect(memberDemand(POLICY, 'apps/server', 'slow', 3)).toEqual({
      want: 6,
      min: 2,
      perWorker: 2,
      weightSource: 'seed',
    })
    expect(memberDemand(POLICY, 'a', 'fast', 3, [reading(150, 100)])).toEqual({
      want: 5,
      min: 2,
      perWorker: 1.5,
      weightSource: 'measured',
    })
    expect(memberDemand(POLICY, 'a', 'fast', 8, [reading(50, 100)])).toEqual({
      want: 4,
      min: 1,
      perWorker: 0.5,
      weightSource: 'measured',
    })
    expect(
      memberDemand(POLICY, 'a', 'fast', 1, [reading(120, 100)]).min,
      '一个进程用 1.2 个核：至少要的令牌数四舍五入，不向上取整成 2 个白占',
    ).toBe(1)
  })

  it('拿到的令牌变成进程数：令牌数 ÷ 每个进程要的令牌数，向下取整，至少 1', () => {
    expect(workersFor(6, 1)).toBe(6)
    expect(workersFor(5, 2)).toBe(2)
    expect(workersFor(4, 1.5)).toBe(2)
    expect(workersFor(1, 2)).toBe(1)
    expect(workersFor(3, 0.5)).toBe(6)
    expect(workersFor(4, 1.3)).toBe(3)
  })
})

describe('一批切多大', () => {
  it('没有启动开销的读数取配置的目标时长；有读数时按「启动不超过一批的这个份额」算，不小于目标时长', () => {
    expect(batchTarget(POLICY, undefined)).toBe(90)
    expect(batchTarget(POLICY, 2.5)).toBe(90)
    expect(batchTarget(POLICY, 10)).toBe(200)
    expect(batchTarget(POLICY, 6.2)).toBe(124)
  })
})

describe('一次运行的启动开销', () => {
  const span = (seconds: number, startupSeconds?: number): MemberSpan => ({
    member: 'packages/x',
    start: 0,
    end: seconds * 1000,
    tokens: 1,
    workers: 1,
    perWorker: 1,
    weightSource: 'default',
    ...(startupSeconds === undefined ? {} : { startupSeconds }),
  })

  it('只算量到的批：平均、合计、占这些批墙钟的份额；一批都没量到时不写这一行', () => {
    expect(startupUse([span(100, 4), span(50, 6), span(10)])).toBe(
      '启动开销：2 批从起批到第一份文件开跑平均 5.0 秒，合计 10 秒，占这些批墙钟的 6.7%',
    )
    expect(startupUse([span(10)])).toBeUndefined()
  })

  it('一批的启动开销：起批到报告里最早开跑的文件；没有开跑时刻的不算', () => {
    const run = (times: number[]) => ({
      member: 'm',
      exitCode: 0,
      wallSeconds: 1,
      report: {
        testResults: times.map((startTime, index) => ({
          name: `f${index}`,
          status: 'passed',
          startTime,
          endTime: startTime + 1,
          assertionResults: [],
        })),
      },
    })
    expect(startupOfRun(run([5300, 4200, 0]), 1000)).toBe(3.2)
    expect(startupOfRun(run([0]), 1000)).toBeUndefined()
    expect(startupOfRun({ member: 'm', exitCode: 1, wallSeconds: 0 }, 1000)).toBeUndefined()
  })
})

describe('一次运行里令牌的用法', () => {
  const span = (tokens: number, seconds: number, cpuSeconds?: number): MemberSpan => ({
    member: 'packages/x',
    start: 0,
    end: seconds * 1000,
    tokens,
    workers: tokens,
    perWorker: 1,
    weightSource: 'default',
    ...(cpuSeconds === undefined ? {} : { cpuSeconds }),
  })

  it('只算量到 CPU 的活：持有的令牌秒、用的 CPU 秒、平均每个令牌几个核', () => {
    expect(tokenUse([span(2, 100, 100), span(4, 50, 200), span(6, 10)])).toBe(
      '令牌的用法：量到 CPU 的 2 件活（共 3 件）持有 400 令牌秒，用了 300 CPU 秒，平均每个令牌 0.75 个核',
    )
  })

  it('一件都没量到时不写这一行', () => {
    expect(tokenUse([span(2, 100)])).toBeUndefined()
    expect(tokenUse([])).toBeUndefined()
  })
})
