// 并行度从机器推，不写死：核数、启动时实测的空闲率与空闲内存给出「工作进程预算」，
// 策略（test-runs.config.json 的 `parallel`）只说预算怎样分给同时运行的成员与成员内的工作进程。
// 比例在 24 核（空闲率 0.8，预算 19）主机上扫描后定；8 核上推出的 3 × 2 是预测，没有复测。见 README_ZH.md「并行度」。
import { availableParallelism, cpus, freemem } from 'node:os'
import type { Parallelism } from '@omne-harness/repo-toolchain/core/test-ledger'

/** 预算怎样分：都是关于预算的比例与上下限，不含任何一台机器的核数。 */
export interface ParallelPolicy {
  /** 同时运行的成员数 = ceil(预算 ÷ 它)。快层的墙钟 ≈ 各成员启动开销之和 ÷ 同时成员数，到 CPU 饱和为止。 */
  readonly memberDivisor: number
  /** 每个成员至多的工作进程数 = ceil(预算 ÷ 它)。vitest 按文件数惰性起进程，小成员用不满，大成员靠它压尾巴。 */
  readonly workerDivisor: number
  /** 每个成员工作进程的上限：超过它，大成员的文件级并行已到头，只会挤别的成员。 */
  readonly maxWorkersPerMember: number
  /** 两个数的下限：再小的机器也至少两个成员并行、每成员两个进程。 */
  readonly minimum: number
  /** 按空闲内存封顶预算时，每个工作进程按多少 MiB 算。 */
  readonly memoryPerWorkerMiB: number
  /** 实测空闲率的采样时长（毫秒）。 */
  readonly sampleMs: number
}

/** 推预算用的机器观察。 */
export interface Machine {
  readonly cores: number
  /** 采样期间全部核的空闲比例，0 到 1。 */
  readonly idleFraction: number
  readonly freeMemoryMiB: number
}

/** 工作进程预算：这一次运行打算同时占多少个 CPU。 */
export interface Budget {
  readonly workers: number
  readonly machine: Machine
  /** 来历：这一步自己采样推出的，还是调用方经 `OMNE_WORKER_BUDGET` 交下来的（检查图在开始前机器安静时采一次，交给各重步骤）。 */
  readonly source: 'sampled' | 'env'
}

/**
 * 调用方交下来的预算。`pnpm run check` 在起任何步骤之前采样一次，再经它交给各重步骤：
 * 重步骤开始时机器上跑着的是本图自己的轻步骤，那时采样会把它们当成别的负载而缩预算。
 * CI 要钉死预算时也设它。
 */
export const WORKER_BUDGET_ENV = 'OMNE_WORKER_BUDGET'

/** `cpus()` 给的样子里这里用到的部分：每个核各状态的累计时间。 */
export type CpuSample = readonly { readonly times: Readonly<Record<string, number>> }[]

/** 两次 `cpus()` 之间全部核的空闲比例；读不到（没有核、时间没走）就当全闲。 */
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

/** 看一眼机器：核数、`sampleMs` 内的空闲率与空闲内存。 */
export async function observeMachine(sampleMs: number): Promise<Machine> {
  const before = cpus()
  await new Promise(resolve => setTimeout(resolve, sampleMs))
  return {
    cores: availableParallelism(),
    idleFraction: idleBetween(before, cpus()),
    freeMemoryMiB: Math.floor(freemem() / (1024 * 1024)),
  }
}

/**
 * 看机器之前先等 `sampleMs`：同一时刻起的兄弟步骤（检查图里一批轻步骤）启动时有一两秒的尖峰，
 * 紧接着采样会把一台空闲的机器看成忙的；等它们进入稳态再量。
 */
export async function observeMachineSettled(sampleMs: number): Promise<Machine> {
  await new Promise(resolve => setTimeout(resolve, sampleMs))
  return observeMachine(sampleMs)
}

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high)

/**
 * 预算 = 核数 × 空闲率，再按空闲内存封顶，至少 1、至多核数。空闲内存读不到（0 或负数）时不封顶。
 * 空闲率让已经忙着的机器（别的检查、后台程序）少被挤；名额脚本挡的是整套检查，挡不住别的负载。
 * 预算只是「同时占多少个 CPU」的目标：成员测试的名义进程数（成员数 × 每成员进程）可以高于它，
 * vitest 按文件数惰性起进程，大成员才用满；超限的表现是起子进程的用例贴近时限，账本的 nearTimeout 列出它们。
 */
export function workerBudget(machine: Machine, policy: ParallelPolicy): Budget {
  const byCpu = Math.floor(machine.cores * machine.idleFraction)
  const byMemory =
    machine.freeMemoryMiB > 0
      ? Math.floor(machine.freeMemoryMiB / policy.memoryPerWorkerMiB)
      : Number.POSITIVE_INFINITY
  return { workers: clamp(Math.min(byCpu, byMemory), 1, machine.cores), machine, source: 'sampled' }
}

/**
 * 这一次运行的预算：`OMNE_WORKER_BUDGET` 已设时以它为准（须为正整数，不超过核数），否则采样机器按策略推。
 */
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

/** 预算按策略分成「同时成员数 × 每成员工作进程数」。 */
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

/** 账本与日志里写的预算来历。 */
export function describeBudget(budget: Budget): string {
  const { workers, machine } = budget
  if (budget.source === 'env')
    return `预算 ${workers} 个进程：由 ${WORKER_BUDGET_ENV} 给定；本机 ${machine.cores} 核`
  return (
    `预算 ${workers} 个进程：本机 ${machine.cores} 核、空闲 ${Math.round(machine.idleFraction * 100)}%` +
    `、空闲内存 ${Math.round(machine.freeMemoryMiB / 1024)} GiB`
  )
}
