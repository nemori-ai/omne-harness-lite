// 测试运行的策略只在 `test-runs.config.json` 里定一次；这里读它、校验它，并接受环境变量的临时覆盖。
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export {
  RUN_SCRIPTS,
  RUN_TIERS,
  TIER_NAMES,
  isRunScript,
  isRunTier,
  ledgerHome,
  type Parallelism,
  type RunScript,
  type RunTier,
} from '@omne-harness/repo-toolchain/core/test-ledger'
import type { Parallelism } from '@omne-harness/repo-toolchain/core/test-ledger'
import { deriveParallelism, type Budget, type ParallelPolicy } from './parallelism.ts'

/**
 * 影响面的路径规则（`src/testing/affected.ts`）。路径模式都相对仓库根：`*` 不跨目录，`**` 跨目录。
 * 每个改动文件按 全局 → 读者 → 成员文件 → Python 工具 → 只需常驻检查 的顺序归类，哪类都不是的判全量。
 */
export interface AffectedRules {
  /** 这些根目录下的成员不参与测试、构建与类型检查的收窄（它们的文件靠下面的规则归类）。 */
  readonly excludeRoots: readonly string[]
  /** 命中任一条即全部成员、全部步骤：决定「怎么跑」的文件与被大量测试读的规格。 */
  readonly globalPaths: readonly string[]
  /** 成员外（或别的成员里）被某些成员的测试读的路径：改了只把这些成员带进来，不沿反向依赖传播。 */
  readonly readers: readonly ReaderRule[]
  /** 成员目录里命中这些模式的文件不算成员改动（除非读者规则点了名）。 */
  readonly memberDocuments: readonly string[]
  /** 命中则跑 pytest。 */
  readonly pythonPaths: readonly string[]
  /** 只被常驻检查读的路径：不构建、不测成员、不跑 pytest。 */
  readonly residentPaths: readonly string[]
  /** 常驻检查运行前要构建的成员（连同它们的依赖），每一份计划都构建。 */
  readonly residentBuild: readonly { readonly member: string; readonly why: string }[]
}

export interface ReaderRule {
  readonly paths: readonly string[]
  /** 成员目录。 */
  readonly members: readonly string[]
  /** 谁读、证据在哪；工具只原样展示。 */
  readonly why: string
}

export interface TestRunsConfig {
  /** 并行度策略：并行度本身由机器推出来，见 `parallelism.ts`。 */
  readonly parallel: ParallelPolicy
  readonly affected: AffectedRules
  readonly ledger: {
    readonly slowFileSeconds: number
    /**
     * 单条用例耗时达到它自身时限的这个比例就列入账本（贴着时限）。初值 0.5：
     * 空闲时就占掉一半时限的用例，机器一忙就会越线。
     */
    readonly nearTimeoutRatio: number
    readonly top: number
  }
  readonly triage: { readonly repeats: number }
  readonly mutation: {
    /**
     * 变异时用例的默认时限（没写自己时限的用例）。Stryker 给每个语句插桩记覆盖，CPU 重的用例会慢上几倍，
     * 平时守得住 5 秒的在初跑里就会超时；变异体本身的超时由 Stryker 另判，不受它影响。
     */
    readonly testTimeoutSeconds: number
    /**
     * 每个成员单独复核时最多复跑的变异体数（#649），含复核范围里嵌套的变异体。超出的超时不复核，成员测量无效。
     * 环境变量 `OMNE_MUTATION_RECHECK_MAX` 可改；0 表示不复核。
     */
    readonly recheckMaxMutants: number
  }
}

export const CONFIG_PATH = fileURLToPath(new URL('../../test-runs.config.json', import.meta.url))

function positiveInteger(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1)
    throw new Error(`${name} 须为正整数`)
  return value
}

function nonNegativeInteger(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0)
    throw new Error(`${name} 须为非负整数`)
  return value
}

function positive(value: unknown, name: string): number {
  if (typeof value !== 'number' || !(value > 0)) throw new Error(`${name} 须为正数`)
  return value
}

function ratio(value: unknown, name: string): number {
  if (typeof value !== 'number' || !(value > 0 && value <= 1))
    throw new Error(`${name} 须在 (0, 1] 之间`)
  return value
}

function strings(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || !value.every((item): item is string => typeof item === 'string'))
    throw new Error(`${name} 须为字符串数组`)
  return value
}

function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name} 须为非空字符串`)
  return value
}

function records(value: unknown, name: string): Record<string, unknown>[] {
  if (
    !Array.isArray(value) ||
    !value.every(
      (item): item is Record<string, unknown> =>
        typeof item === 'object' && item !== null && !Array.isArray(item),
    )
  )
    throw new Error(`${name} 须为对象数组`)
  return value
}

function parseAffected(raw: Record<string, unknown> | undefined): AffectedRules {
  return {
    excludeRoots: strings(raw?.['excludeRoots'], 'affected.excludeRoots'),
    globalPaths: strings(raw?.['globalPaths'], 'affected.globalPaths'),
    readers: records(raw?.['readers'], 'affected.readers').map((reader, index) => {
      const name = `affected.readers[${index}]`
      const paths = strings(reader['paths'], `${name}.paths`)
      const members = strings(reader['members'], `${name}.members`)
      if (paths.length === 0 || members.length === 0)
        throw new Error(`${name} 的 paths 与 members 都不能为空`)
      return { paths, members, why: text(reader['why'], `${name}.why`) }
    }),
    memberDocuments: strings(raw?.['memberDocuments'], 'affected.memberDocuments'),
    pythonPaths: strings(raw?.['pythonPaths'], 'affected.pythonPaths'),
    residentPaths: strings(raw?.['residentPaths'], 'affected.residentPaths'),
    residentBuild: records(raw?.['residentBuild'], 'affected.residentBuild').map(
      (entry, index) => ({
        member: text(entry['member'], `affected.residentBuild[${index}].member`),
        why: text(entry['why'], `affected.residentBuild[${index}].why`),
      }),
    ),
  }
}

export function parseTestRunsConfig(parsed: unknown): TestRunsConfig {
  const raw = parsed as {
    parallel?: {
      memberDivisor?: unknown
      workerDivisor?: unknown
      maxWorkersPerMember?: unknown
      minimum?: unknown
      memoryPerWorkerMiB?: unknown
      sampleMs?: unknown
    }
    affected?: Record<string, unknown>
    ledger?: { slowFileSeconds?: unknown; nearTimeoutRatio?: unknown; top?: unknown }
    triage?: { repeats?: unknown }
    mutation?: { testTimeoutSeconds?: unknown; recheckMaxMutants?: unknown }
  }
  return {
    parallel: {
      memberDivisor: positive(raw.parallel?.memberDivisor, 'parallel.memberDivisor'),
      workerDivisor: positive(raw.parallel?.workerDivisor, 'parallel.workerDivisor'),
      maxWorkersPerMember: positiveInteger(
        raw.parallel?.maxWorkersPerMember,
        'parallel.maxWorkersPerMember',
      ),
      minimum: positiveInteger(raw.parallel?.minimum, 'parallel.minimum'),
      memoryPerWorkerMiB: positive(raw.parallel?.memoryPerWorkerMiB, 'parallel.memoryPerWorkerMiB'),
      sampleMs: nonNegativeInteger(raw.parallel?.sampleMs, 'parallel.sampleMs'),
    },
    affected: parseAffected(raw.affected),
    ledger: {
      slowFileSeconds: positive(raw.ledger?.slowFileSeconds, 'ledger.slowFileSeconds'),
      nearTimeoutRatio: ratio(raw.ledger?.nearTimeoutRatio, 'ledger.nearTimeoutRatio'),
      top: positiveInteger(raw.ledger?.top, 'ledger.top'),
    },
    triage: { repeats: positiveInteger(raw.triage?.repeats, 'triage.repeats') },
    mutation: {
      testTimeoutSeconds: positive(raw.mutation?.testTimeoutSeconds, 'mutation.testTimeoutSeconds'),
      recheckMaxMutants: nonNegativeInteger(
        raw.mutation?.recheckMaxMutants,
        'mutation.recheckMaxMutants',
      ),
    },
  }
}

export function readTestRunsConfig(): TestRunsConfig {
  try {
    return parseTestRunsConfig(JSON.parse(readFileSync(CONFIG_PATH, 'utf8')))
  } catch (error) {
    throw new Error(`${CONFIG_PATH}: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    })
  }
}

/** 成员并行数的临时覆盖；机器忙或闲时用它调，不改配置文件。 */
export const MEMBER_CONCURRENCY_ENV = 'OMNE_TEST_MEMBER_CONCURRENCY'
/** vitest 自己认的工作进程上限；设了它，各成员配置里的 `maxWorkers` 也被它盖过。 */
export const VITEST_MAX_WORKERS_ENV = 'VITEST_MAX_WORKERS'

/** 并行度：按策略从预算推出来；环境变量已设的以环境变量为准。 */
export function effectiveParallelism(
  config: TestRunsConfig,
  env: Readonly<Record<string, string | undefined>>,
  budget: Budget,
): Parallelism {
  const derived = deriveParallelism(budget, config.parallel)
  const override = (name: string, fallback: number) => {
    const value = env[name]
    if (value === undefined || value === '') return fallback
    if (!/^[1-9]\d*$/u.test(value)) throw new Error(`环境变量 ${name} 须为正整数，现在是 ${value}`)
    return Number(value)
  }
  return {
    memberConcurrency: override(MEMBER_CONCURRENCY_ENV, derived.memberConcurrency),
    vitestMaxWorkers: override(VITEST_MAX_WORKERS_ENV, derived.vitestMaxWorkers),
  }
}

/** 复核上限的临时覆盖（#649）。 */
export const RECHECK_MAX_ENV = 'OMNE_MUTATION_RECHECK_MAX'

/** 每个成员复核时最多复跑的变异体数：配置给初值，环境变量已设的以环境变量为准；0 表示不复核。 */
export function effectiveRecheckMax(
  config: TestRunsConfig,
  env: Readonly<Record<string, string | undefined>>,
): number {
  const value = env[RECHECK_MAX_ENV]
  if (value === undefined || value === '') return config.mutation.recheckMaxMutants
  if (!/^(0|[1-9]\d*)$/u.test(value))
    throw new Error(`环境变量 ${RECHECK_MAX_ENV} 须为非负整数，现在是 ${value}`)
  return Number(value)
}
