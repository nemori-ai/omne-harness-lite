// 测试账本的读取契约：测试运行器写账本，回路与体检页读账本。这里定脚本、层、账本位置与账本正文的形状；
// 怎样跑测试、怎样汇总报告归测试运行器。
import { join } from 'node:path'

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

/** 一次运行的抬头：`ledger.json` 的 `meta`。读它的有体检页（测试）与回路的验收耗时传感器。 */
export interface RunMeta {
  readonly script: RunScript
  /** 跑的是哪一层；早于分层的账本没有这一栏，读时按 `all`。 */
  readonly tier: RunTier
  readonly head: string
  readonly branch: string
  readonly dirty: boolean
  /** 跑的是全部成员（`--all`，或判为全量的计划）时为 null。 */
  readonly base: { readonly ref: string; readonly mergeBase: string } | null
  readonly startedAt: string
  readonly parallel: Parallelism
  readonly cores: number
  /** 按影响面选成员时那份计划的模式与理由；`--all` 为 null。 */
  readonly plan: { readonly mode: 'full' | 'scoped'; readonly reason: string } | null
  /**
   * 按计划跑验收时写：计划没选中、因而没跑的有验收的成员，与为什么。有它的账本对它列出的成员也算交代过了
   * （回路的验收耗时传感器据此认「本次影响面不含带验收的成员」）。
   */
  readonly scope?: { readonly reason: string; readonly skipped: readonly string[] }
  /** 这次跑了的成员目录。 */
  readonly members: readonly string[]
  /** 整次运行的墙钟，取整到秒。 */
  readonly wallSeconds: number
}

/** 运行目录里的 `ledger.json`。 */
export interface LedgerFile extends Ledger {
  readonly meta: RunMeta
}

export interface Failure {
  readonly member: string
  /** 仓库相对的测试文件；整个成员没出报告时为 undefined。 */
  readonly file?: string
  /** 用例全名；文件级失败（收集或加载出错）时为 undefined。 */
  readonly test?: string
  readonly message: string
}

export interface Ledger {
  readonly members: readonly {
    readonly member: string
    readonly exitCode: number
    readonly wallSeconds: number
    readonly files: number
    /** 跑了的用例（通过或失败）。 */
    readonly tests: number
    /** 没跑的用例：`.skip`、`.todo`、被层过滤掉的（文件里还有别的用例要跑时，它们以跳过出现在报告里）。 */
    readonly skipped: number
    readonly failed: number
    /** 各文件用例耗时之和（从第一条用例开始到最后一条结束，不含导入）。 */
    readonly fileSeconds: number
    /** 各文件导入耗时之和；没有计时报告时不写。墙钟减去两者之和是进程启动、类型检查与并行重叠。 */
    readonly collectSeconds?: number
  }[]
  readonly files: readonly {
    readonly member: string
    readonly file: string
    readonly seconds: number
    /** 跑了的用例。 */
    readonly tests: number
    /** 跑了的用例里归慢层的（带 `slow` 标签，含整文件的）；没有计时报告时一律按快层，为 0。 */
    readonly slowTests: number
    /** 跑了的快层用例的耗时之和。 */
    readonly fastSeconds: number
    /** 跑了的用例里最长的一条。 */
    readonly longestSeconds: number
    /** 导入这个测试文件（含它的依赖与 describe 回调）的耗时；没有计时报告时不写。 */
    readonly collectSeconds?: number
  }[]
  /** 耗时达到自身时限 × `nearTimeoutRatio` 的用例，按占时限的比例从高到低。 */
  readonly nearTimeout: readonly {
    readonly member: string
    readonly file: string
    readonly test: string
    readonly seconds: number
    readonly timeoutSeconds: number
    /** 时限取自计时报告为 false；拿不到、按 vitest 默认时限假定的为 true。 */
    readonly timeoutAssumed: boolean
    /** 这条用例归慢层。 */
    readonly slow: boolean
  }[]
  /**
   * 快层里超出单条预算的用例，按耗时从高到低：耗时 ≥ 自身时限与 vitest 默认时限中较小的那个 × `nearTimeoutRatio`。
   * 自带更宽时限的也按默认时限判——快层的预算不随用例自己放宽的时限放宽。
   */
  readonly fastOverBudget: readonly {
    readonly member: string
    readonly file: string
    readonly test: string
    readonly seconds: number
  }[]
  readonly failures: readonly Failure[]
}
