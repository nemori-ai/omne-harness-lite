import { availableParallelism } from 'node:os'
import type { RunTier } from '@omne-harness/repo-toolchain/core/test-ledger'

export interface WorkerTokens {
  readonly member: string
  readonly tier: RunTier
  readonly tokens: number
  readonly why: string
}

export interface WeightPolicy {
  readonly floor: number
  readonly ceiling: number
  readonly readings: number
  readonly minProcessSeconds: number
}

export interface ParallelPolicy {
  readonly maxWorkersPerMember: number
  readonly reserveCores: number
  readonly tokensPerWorker: readonly WorkerTokens[]
  readonly weight: WeightPolicy
  readonly batchSeconds: number
}

export interface WeightReading {
  readonly cpuSeconds: number
  readonly processSeconds: number
}

export const READING_VERSION = 2

export type WeightSource = 'measured' | 'seed' | 'default'

export interface ProcessWeight {
  readonly tokens: number
  readonly source: WeightSource
}

export const WORKER_BUDGET_ENV = 'OMNE_WORKER_BUDGET'

export function machineCapacity(policy: ParallelPolicy, cores: number = availableParallelism()) {
  return Math.max(1, cores - policy.reserveCores)
}

export interface Budget {
  readonly workers: number
  readonly cores: number
  readonly source: 'env' | 'capacity'
}

export function budgetFor(
  policy: ParallelPolicy,
  env: Readonly<Record<string, string | undefined>> = process.env,
  cores: number = availableParallelism(),
): Budget {
  const given = env[WORKER_BUDGET_ENV]
  if (given !== undefined && given !== '') {
    if (!/^[1-9]\d*$/u.test(given))
      throw new Error(`环境变量 ${WORKER_BUDGET_ENV} 须为正整数，现在是 ${given}`)
    return { workers: Math.min(Number(given), cores), cores, source: 'env' }
  }
  return { workers: machineCapacity(policy, cores), cores, source: 'capacity' }
}

export function processWeight(
  policy: ParallelPolicy,
  member: string,
  tier: RunTier,
  readings: readonly WeightReading[],
): ProcessWeight {
  const { floor, ceiling, minProcessSeconds } = policy.weight
  const measured = readings
    .filter(reading => reading.processSeconds >= minProcessSeconds)
    .slice(0, policy.weight.readings)
    .map(reading => reading.cpuSeconds / reading.processSeconds)
  if (measured.length > 0) {
    const tokens = Math.min(ceiling, Math.max(floor, ...measured))
    return { tokens: Math.round(tokens * 100) / 100, source: 'measured' }
  }
  const seed = policy.tokensPerWorker.find(entry => entry.member === member && entry.tier === tier)
  return seed === undefined
    ? { tokens: 1, source: 'default' }
    : { tokens: seed.tokens, source: 'seed' }
}

export interface MemberDemand {
  readonly want: number
  readonly min: number
  readonly perWorker: number
  readonly weightSource: WeightSource
}

export function memberDemand(
  policy: ParallelPolicy,
  member: string,
  tier: RunTier,
  files: number | undefined,
  readings: readonly WeightReading[] = [],
): MemberDemand {
  const weight = processWeight(policy, member, tier, readings)
  const workers = Math.min(policy.maxWorkersPerMember, Math.max(1, files ?? Infinity))
  return {
    want: Math.ceil(workers * weight.tokens),
    min: Math.max(1, Math.round(weight.tokens)),
    perWorker: weight.tokens,
    weightSource: weight.source,
  }
}

export function workersFor(tokens: number, perWorker: number): number {
  return Math.max(1, Math.floor(tokens / perWorker))
}

export function describeBudget(budget: Budget): string {
  const { workers, cores } = budget
  if (budget.source === 'env')
    return `预算 ${workers} 个进程：拿到 ${workers} 个令牌（${WORKER_BUDGET_ENV}）；本机 ${cores} 核`
  return `预算 ${workers} 个进程：不在令牌之内，按整机容量（核数减留下的核）；本机 ${cores} 核`
}
