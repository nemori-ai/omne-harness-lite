// 测试运行的策略只在 `test-runs.config.json` 里定一次；这里读它、校验它，并接受环境变量的临时覆盖。
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export interface Parallelism {
  /** 同时跑几个成员的测试。 */
  readonly memberConcurrency: number
  /** 每个成员的 vitest 最多起几个工作进程。两者之积不该超过核数。 */
  readonly vitestMaxWorkers: number
}

export interface TestRunsConfig {
  readonly parallel: Parallelism
  readonly affected: {
    /** 这些根目录下的成员不参与测试运行。 */
    readonly excludeRoots: readonly string[]
    /** 命中任一条即判为「全部受影响」的仓库相对路径模式（`*` 不跨目录，`**` 跨目录）。 */
    readonly globalPaths: readonly string[]
  }
  readonly ledger: {
    readonly slowFileSeconds: number
    /**
     * 单条用例耗时到这个数就列入账本。初值取 vitest 默认时限（5 秒）的一半：
     * 空闲时就占掉一半时限的用例，机器一忙就会越线。
     */
    readonly slowTestSeconds: number
    readonly top: number
  }
  readonly triage: { readonly repeats: number }
}

const CONFIG_PATH = fileURLToPath(new URL('../../test-runs.config.json', import.meta.url))

function positiveInteger(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1)
    throw new Error(`${name} 须为正整数`)
  return value
}

function positive(value: unknown, name: string): number {
  if (typeof value !== 'number' || !(value > 0)) throw new Error(`${name} 须为正数`)
  return value
}

function strings(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || !value.every((item): item is string => typeof item === 'string'))
    throw new Error(`${name} 须为字符串数组`)
  return value
}

export function parseTestRunsConfig(parsed: unknown): TestRunsConfig {
  const raw = parsed as {
    parallel?: { memberConcurrency?: unknown; vitestMaxWorkers?: unknown }
    affected?: { excludeRoots?: unknown; globalPaths?: unknown }
    ledger?: { slowFileSeconds?: unknown; slowTestSeconds?: unknown; top?: unknown }
    triage?: { repeats?: unknown }
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
    affected: {
      excludeRoots: strings(raw.affected?.excludeRoots, 'affected.excludeRoots'),
      globalPaths: strings(raw.affected?.globalPaths, 'affected.globalPaths'),
    },
    ledger: {
      slowFileSeconds: positive(raw.ledger?.slowFileSeconds, 'ledger.slowFileSeconds'),
      slowTestSeconds: positive(raw.ledger?.slowTestSeconds, 'ledger.slowTestSeconds'),
      top: positiveInteger(raw.ledger?.top, 'ledger.top'),
    },
    triage: { repeats: positiveInteger(raw.triage?.repeats, 'triage.repeats') },
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
