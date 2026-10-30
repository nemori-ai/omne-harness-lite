// 成员之间并行：Stryker 的工作进程总数不超过预算，按各成员的工作量分；一个成员跑完，它的进程交给还没开始的成员。
// 每个成员的 Stryker 有一段与变异体数无关的固定开销（构建、预检、初跑都只用一个进程），成员挨个跑时这段开销串起来；
// 同时跑就叠在一起。Stryker 的工作进程数在启动时定下，跑到一半不能加，所以只在成员开始时分；预算偏小时启动就告警。
import { VITEST_MAX_WORKERS_ENV } from '../testing/config.ts'
import { WORKER_BUDGET_ENV, type Budget } from '../testing/parallelism.ts'

/** 一个成员的工作量估计。 */
export interface MemberWork {
  /** 相对大小：上次的耗时（秒）或要变异的行数，同一批成员用同一种单位。 */
  readonly weight: number
  /** 至多给几个工作进程：多于变异体数的进程只有启动开销，跑不到变异体。 */
  readonly cap: number
}

/** 没有上次的记录时，按一行改动至多几个变异体估工作进程的上限（实测一行改动生成 3～11 个）。 */
export const MUTANTS_PER_LINE = 4

/** 排成员并行要的输入：要变异的行数，以及快照里上次的记录（没有快照时不给）。 */
export interface WorkInput {
  readonly lines: number
  readonly history?: { readonly workerSeconds: number; readonly mutants: number }
}

/**
 * 各成员的工作量与开始的先后。每个成员都有上次的记录时，工作量取上次第一遍的「耗时 × 工作进程数」，
 * 工作进程至多给到上次的变异体数。有一个没有记录，就平分：行数估不出测试有多慢（一行改动可能要跑很慢的测试），
 * 按行数分会把进程压给错的成员；这时上限按行数估（`MUTANTS_PER_LINE`），用不完的分给别的成员。
 * 开始的先后按工作量从大到小，相同的按行数从多到少，再按成员顺序。
 */
export function planWorks(
  inputs: readonly WorkInput[],
  budget: number,
): { readonly works: MemberWork[]; readonly order: number[]; readonly basis: 'history' | 'even' } {
  const known = inputs.every(input => input.history !== undefined)
  const works = inputs.map(({ lines, history }) =>
    known && history !== undefined
      ? { weight: history.workerSeconds, cap: Math.max(1, history.mutants) }
      : { weight: 1, cap: Math.max(1, Math.min(budget, lines * MUTANTS_PER_LINE)) },
  )
  const order = [...works.keys()].sort(
    (a, b) =>
      (works[b]?.weight ?? 0) - (works[a]?.weight ?? 0) ||
      (inputs[b]?.lines ?? 0) - (inputs[a]?.lines ?? 0) ||
      a - b,
  )
  return { works, order, basis: known ? 'history' : 'even' }
}

/**
 * 把 `budget` 个工作进程分给同时开始的几个成员：每个至少 1 个、至多它的 `cap`，其余按 `weight` 成比例分；
 * 封顶后多出来的再分给没封顶的。总数不超过 `budget`（成员数多于 `budget` 时只能每个 1 个，调用方不该这样调用）。
 * 结果只由输入决定：取整后多出的进程按小数部分从大到小、再按下标给。
 */
export function allocateWorkers(budget: number, members: readonly MemberWork[]): number[] {
  const shares = members.map(() => 1)
  let left = budget - members.length
  const open = new Set(members.keys())
  for (const [index, member] of members.entries())
    if (Math.max(1, Math.floor(member.cap)) <= 1) open.delete(index)
  while (left > 0 && open.size > 0) {
    const total = [...open].reduce(
      (sum, index) => sum + Math.max(0, members[index]?.weight ?? 0),
      0,
    )
    // 权重全为 0 时平分。
    const exact = new Map(
      [...open].map(index => {
        const weight = Math.max(0, members[index]?.weight ?? 0)
        return [index, total > 0 ? (left * weight) / total : left / open.size] as const
      }),
    )
    const room = (index: number) =>
      Math.max(1, Math.floor(members[index]?.cap ?? 1)) - (shares[index] ?? 1)
    let given = 0
    for (const [index, value] of exact) {
      const add = Math.min(Math.floor(value), room(index))
      shares[index] = (shares[index] ?? 1) + add
      given += add
    }
    const byFraction = [...exact]
      .filter(([index]) => room(index) > 0)
      .sort(([a, x], [b, y]) => y - Math.floor(y) - (x - Math.floor(x)) || a - b)
    for (const [index] of byFraction) {
      if (given >= left) break
      shares[index] = (shares[index] ?? 1) + 1
      given += 1
    }
    left -= given
    for (const index of open) if (room(index) <= 0) open.delete(index)
    // 一轮一个都没分出去（剩下的都封顶了）就停。
    if (given === 0) break
  }
  return shares
}

/**
 * 按预算同时跑几个成员：`order` 给出开始的先后（通常工作量大的在前），有空闲的进程就让排在前面的成员开始，
 * 一次开始的成员一起按 `allocateWorkers` 分空闲的进程；成员跑完，它的进程还回去。`run` 的结果按下标放回，与完成先后无关。
 * `run` 不该抛错；抛了就当作这一批运行失败，原样抛给调用方（已开始的成员照样等它们跑完）。
 */
export async function runWithinBudget<T>(
  budget: number,
  works: readonly MemberWork[],
  order: readonly number[],
  run: (index: number, workers: number) => Promise<T>,
): Promise<T[]> {
  const results: T[] = []
  const queue = [...order]
  let free = Math.max(1, budget)
  let failure: { error: unknown } | undefined
  const running = new Set<Promise<void>>()
  const startWave = () => {
    const wave = queue.splice(0, Math.min(free, queue.length))
    if (wave.length === 0) return
    const shares = allocateWorkers(
      free,
      wave.map(index => works[index] ?? { weight: 0, cap: 1 }),
    )
    for (const [position, index] of wave.entries()) {
      const workers = shares[position] ?? 1
      free -= workers
      const task = (async () => {
        try {
          results[index] = await run(index, workers)
        } catch (error) {
          failure ??= { error }
        } finally {
          free += workers
        }
      })()
      running.add(task)
      void task.finally(() => running.delete(task))
    }
  }
  startWave()
  while (running.size > 0) {
    await Promise.race(running)
    if (failure === undefined) startWave()
  }
  if (failure !== undefined) throw failure.error
  return results
}

/** 命令行参数在 bash 里原样可贴：只含常见字符的照写，别的加单引号。 */
function shellWord(arg: string): string {
  return /^[\w@%+=:,./~^-]+$/u.test(arg) ? arg : `'${arg.replaceAll("'", `'"'"'`)}'`
}

/**
 * 启动时的进程数告警：没有设 `VITEST_MAX_WORKERS`，而预算给的进程数不到本机核数的一半时，写明预算从哪来
 * （取样时的空闲比例与空闲内存，或 `OMNE_WORKER_BUDGET`），以及用 `VITEST_MAX_WORKERS` 重启的命令。
 * 建议值取核数的一半（向上取整），正好不再告警。`args` 是 `pnpm run mutation` 之后的参数。不该告警时为 undefined。
 */
export function workerWarning(
  budget: Budget,
  env: Readonly<Record<string, string | undefined>>,
  args: readonly string[],
): string | undefined {
  const given = env[VITEST_MAX_WORKERS_ENV]
  if (given !== undefined && given !== '') return undefined
  const { workers, machine } = budget
  if (workers * 2 >= machine.cores) return undefined
  const suggested = Math.ceil(machine.cores / 2)
  const command = [
    `${VITEST_MAX_WORKERS_ENV}=${suggested}`,
    'pnpm run mutation',
    ...args.map(shellWord),
  ].join(' ')
  const memoryCapped = workers < Math.floor(machine.cores * machine.idleFraction)
  const source =
    budget.source === 'env'
      ? `预算由环境变量 ${WORKER_BUDGET_ENV} 给定，没有取样`
      : `取样时空闲 ${Math.round(machine.idleFraction * 100)}%、空闲内存 ${Math.round(machine.freeMemoryMiB / 1024)} GiB` +
        (memoryCapped ? '，预算受空闲内存所限，加进程前先确认内存够用' : '')
  return (
    `告警：Stryker 只分到 ${workers} 个工作进程，不到本机 ${machine.cores} 核的一半（${source}）。` +
    `机器其实空闲时，停掉这次运行，用 \`${command}\` 重启`
  )
}
