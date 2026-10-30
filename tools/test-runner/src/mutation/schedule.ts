// 成员之间并行：Stryker 的工作进程总数不超过预算，按各成员的工作量分；一个成员跑完，它的进程交给还没开始的成员。
// 每个成员的 Stryker 有一段与变异体数无关的固定开销（构建、预检、初跑都只用一个进程），成员挨个跑时这段开销串起来；
// 同时跑就叠在一起。Stryker 的工作进程数在启动时定下，跑到一半不能加，所以只在成员开始时分。

/** 一个成员的工作量估计。 */
export interface MemberWork {
  /** 相对大小：上次的耗时（秒）或要变异的行数，同一批成员用同一种单位。 */
  readonly weight: number
  /** 至多给几个工作进程：多于变异体数的进程只有启动开销，跑不到变异体。 */
  readonly cap: number
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
