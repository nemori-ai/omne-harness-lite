// 覆盖率采集（repo-toolchain 的 omne-metrics --coverage）跨成员并行的并发度。预算只在测试运行器里推，
// repo-toolchain 不依赖测试运行器，由 scripts/metrics.sh 经 `cli.ts coverage-parallel` 要来再交下去。
import { deriveParallelism, type Budget, type ParallelPolicy } from './parallelism.ts'

/** 同时几个成员，每个成员的 vitest 至多几个工作进程。 */
export interface CoverageParallelism {
  readonly members: number
  readonly workers: number
}

/**
 * 每成员工作进程数按并行策略分（同成员测试），不超过预算；再按预算定同时几个成员，使两数之积不超过预算：
 * 与成员测试不同，覆盖率这一趟不按名义进程数超订。
 */
export function coverageParallelism(budget: Budget, policy: ParallelPolicy): CoverageParallelism {
  const workers = Math.min(deriveParallelism(budget, policy).vitestMaxWorkers, budget.workers)
  return { members: Math.max(1, Math.floor(budget.workers / workers)), workers }
}
