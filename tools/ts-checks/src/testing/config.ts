// 测试运行的策略只在 `test-runs.config.json` 里定一次；这里读它、校验它，并接受环境变量的临时覆盖。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 运行器逐成员跑的脚本：`test` 是成员的测试，`acceptance` 是成员的可执行验收（`docs/workspace.md`「可执行验收」）。
 * 两种运行共用并行度与账本格式，账本各放一处，互不混入。
 */
export const RUN_SCRIPTS = ['test', 'acceptance'] as const
export type RunScript = (typeof RUN_SCRIPTS)[number]

const LEDGER_HOMES: Readonly<Record<RunScript, { readonly env: string; readonly dir: string }>> = {
  test: { env: 'OMNE_TEST_LEDGER_HOME', dir: 'test-ledger' },
  acceptance: { env: 'OMNE_ACCEPTANCE_LEDGER_HOME', dir: 'acceptance-ledger' },
}

export function isRunScript(value: unknown): value is RunScript {
  return (RUN_SCRIPTS as readonly unknown[]).includes(value)
}

/**
 * 测试分为快慢两层（docs/verification.md「测试分层」）：`all` 两层都跑。层的定义在仓库根 `vitest.tiers.mts`，
 * 运行器只经下面这个环境变量告诉成员这一轮跑哪一层（本包构建的 rootDir 是 src，引不到根上的文件，
 * 名字在这里重抄一遍，由自测钉住两边一致）。
 */
export const RUN_TIERS = ['fast', 'slow', 'all'] as const
export type RunTier = (typeof RUN_TIERS)[number]
export const TEST_TIER_ENV = 'OMNE_TEST_TIER'

export function isRunTier(value: unknown): value is RunTier {
  return (RUN_TIERS as readonly unknown[]).includes(value)
}

/** 摘要与体检页里怎么称呼各层。 */
export const TIER_NAMES: Readonly<Record<RunTier, string>> = {
  fast: '快层',
  slow: '慢层',
  all: '两层',
}

/** 账本根：环境变量给了用它，否则是主检出的 `tmp/<脚本>-ledger/`。下面一层是提交，再下一层是每次运行。 */
export function ledgerHome(
  script: RunScript,
  mainRoot: string,
  env: Readonly<Record<string, string | undefined>>,
): string {
  const { env: name, dir } = LEDGER_HOMES[script]
  const value = env[name]
  return value === undefined || value === '' ? join(mainRoot, 'tmp', dir) : value
}

export interface Parallelism {
  /** 同时跑几个成员的测试。 */
  readonly memberConcurrency: number
  /** 每个成员的 vitest 最多起几个工作进程。两者之积不该超过核数。 */
  readonly vitestMaxWorkers: number
}

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
  readonly parallel: Parallelism
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
  }
}

export const CONFIG_PATH = fileURLToPath(new URL('../../test-runs.config.json', import.meta.url))

function positiveInteger(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1)
    throw new Error(`${name} 须为正整数`)
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
    parallel?: { memberConcurrency?: unknown; vitestMaxWorkers?: unknown }
    affected?: Record<string, unknown>
    ledger?: { slowFileSeconds?: unknown; nearTimeoutRatio?: unknown; top?: unknown }
    triage?: { repeats?: unknown }
    mutation?: { testTimeoutSeconds?: unknown }
  }
  return {
    parallel: {
      memberConcurrency: positiveInteger(
        raw.parallel?.memberConcurrency,
        'parallel.memberConcurrency',
      ),
      vitestMaxWorkers: positiveInteger(
        raw.parallel?.vitestMaxWorkers,
        'parallel.vitestMaxWorkers',
      ),
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

/** 配置给初值，环境变量已设的以环境变量为准。 */
export function effectiveParallelism(
  config: TestRunsConfig,
  env: Readonly<Record<string, string | undefined>>,
): Parallelism {
  const override = (name: string, fallback: number) => {
    const value = env[name]
    if (value === undefined || value === '') return fallback
    if (!/^[1-9]\d*$/u.test(value)) throw new Error(`环境变量 ${name} 须为正整数，现在是 ${value}`)
    return Number(value)
  }
  return {
    memberConcurrency: override(MEMBER_CONCURRENCY_ENV, config.parallel.memberConcurrency),
    vitestMaxWorkers: override(VITEST_MAX_WORKERS_ENV, config.parallel.vitestMaxWorkers),
  }
}
