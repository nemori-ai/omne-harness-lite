import { availableParallelism } from 'node:os'
import type { RunTier } from '@omne-harness/repo-toolchain/core/test-ledger'

export interface WorkerTokens {
  readonly member: string
  readonly tier: RunTier
  readonly tokens: number
  readonly why: string
}

export interface ParallelPolicy {
  readonly maxWorkersPerMember: number
  readonly reserveCores: number
  readonly tokensPerWorker: readonly WorkerTokens[]
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

export function tokensPerWorker(policy: ParallelPolicy, member: string, tier: RunTier): number {
  return (
    policy.tokensPerWorker.find(entry => entry.member === member && entry.tier === tier)?.tokens ??
    1
  )
}

export function memberDemand(
  policy: ParallelPolicy,
  member: string,
  tier: RunTier,
  files: number | undefined,
): { readonly want: number; readonly min: number; readonly perWorker: number } {
  const perWorker = tokensPerWorker(policy, member, tier)
  const workers = Math.min(policy.maxWorkersPerMember, Math.max(1, files ?? Infinity))
  return { want: Math.ceil(workers * perWorker), min: Math.ceil(perWorker), perWorker }
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
