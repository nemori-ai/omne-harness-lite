import { availableParallelism, cpus, freemem } from 'node:os'
import type { Parallelism } from '@omne-harness/repo-toolchain/core/test-ledger'

export interface ParallelPolicy {
  readonly memberDivisor: number
  readonly workerDivisor: number
  readonly maxWorkersPerMember: number
  readonly minimum: number
  readonly memoryPerWorkerMiB: number
  readonly sampleMs: number
  readonly reserveCores: number
  readonly concurrentRuns: number
}

export interface Machine {
  readonly cores: number
  readonly idleFraction: number
  readonly freeMemoryMiB: number
}

export interface Budget {
  readonly workers: number
  readonly machine: Machine
  readonly source: 'sampled' | 'env'
}

export const WORKER_BUDGET_ENV = 'OMNE_WORKER_BUDGET'

export type CpuSample = readonly { readonly times: Readonly<Record<string, number>> }[]

export function idleBetween(before: CpuSample, after: CpuSample): number {
  let idle = 0
  let total = 0
  for (const [index, core] of after.entries()) {
    const previous = before[index]
    if (previous === undefined) continue
    for (const [key, value] of Object.entries(core.times)) {
      const delta = value - (previous.times[key] ?? 0)
      total += delta
      if (key === 'idle') idle += delta
    }
  }
  return total > 0 ? idle / total : 1
}

export async function observeMachine(sampleMs: number): Promise<Machine> {
  const before = cpus()
  await new Promise(resolve => setTimeout(resolve, sampleMs))
  return {
    cores: availableParallelism(),
    idleFraction: idleBetween(before, cpus()),
    freeMemoryMiB: Math.floor(freemem() / (1024 * 1024)),
  }
}

export async function observeMachineSettled(sampleMs: number): Promise<Machine> {
  await new Promise(resolve => setTimeout(resolve, sampleMs))
  return observeMachine(sampleMs)
}

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high)

export function workerBudget(machine: Machine, policy: ParallelPolicy): Budget {
  const pool = Math.max(1, machine.cores - policy.reserveCores)
  const byCpu = Math.floor(pool / policy.concurrentRuns)
  const byMemory =
    machine.freeMemoryMiB > 0
      ? Math.floor(machine.freeMemoryMiB / policy.memoryPerWorkerMiB)
      : Number.POSITIVE_INFINITY
  return { workers: clamp(Math.min(byCpu, byMemory), 1, machine.cores), machine, source: 'sampled' }
}

export async function budgetFor(
  policy: ParallelPolicy,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<Budget> {
  const given = env[WORKER_BUDGET_ENV]
  if (given !== undefined && given !== '') {
    if (!/^[1-9]\d*$/u.test(given))
      throw new Error(`环境变量 ${WORKER_BUDGET_ENV} 须为正整数，现在是 ${given}`)
    const machine = await observeMachine(0)
    return { workers: Math.min(Number(given), machine.cores), machine, source: 'env' }
  }
  return workerBudget(await observeMachineSettled(policy.sampleMs), policy)
}

export function deriveParallelism(budget: Budget, policy: ParallelPolicy): Parallelism {
  const { workers } = budget
  return {
    memberConcurrency: Math.max(policy.minimum, Math.ceil(workers / policy.memberDivisor)),
    vitestMaxWorkers: clamp(
      Math.ceil(workers / policy.workerDivisor),
      policy.minimum,
      Math.max(policy.minimum, policy.maxWorkersPerMember),
    ),
  }
}

export function describeBudget(budget: Budget): string {
  const { workers, machine } = budget
  if (budget.source === 'env')
    return `预算 ${workers} 个进程：由 ${WORKER_BUDGET_ENV} 给定；本机 ${machine.cores} 核`
  return (
    `预算 ${workers} 个进程：本机 ${machine.cores} 核，池子按同机几次检查平分` +
    `（当时空闲 ${Math.round(machine.idleFraction * 100)}%，不进预算）` +
    `、空闲内存 ${Math.round(machine.freeMemoryMiB / 1024)} GiB`
  )
}
