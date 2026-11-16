import { deriveParallelism, type Budget, type ParallelPolicy } from './parallelism.ts'

export interface CoverageParallelism {
  readonly members: number
  readonly workers: number
}

export function coverageParallelism(budget: Budget, policy: ParallelPolicy): CoverageParallelism {
  const workers = Math.min(deriveParallelism(budget, policy).vitestMaxWorkers, budget.workers)
  return { members: Math.max(1, Math.floor(budget.workers / workers)), workers }
}
