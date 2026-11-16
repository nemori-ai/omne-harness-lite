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

export interface AffectedRules {
  readonly excludeRoots: readonly string[]
  readonly globalPaths: readonly string[]
  readonly readers: readonly ReaderRule[]
  readonly memberDocuments: readonly string[]
  readonly pythonPaths: readonly string[]
  readonly residentPaths: readonly string[]
  readonly residentBuild: readonly { readonly member: string; readonly why: string }[]
}

export interface ReaderRule {
  readonly paths: readonly string[]
  readonly members: readonly string[]
  readonly why: string
}

export interface TestRunsConfig {
  readonly parallel: ParallelPolicy
  readonly affected: AffectedRules
  readonly ledger: {
    readonly slowFileSeconds: number
    readonly nearTimeoutRatio: number
    readonly top: number
  }
  readonly triage: { readonly repeats: number }
  readonly cache: CacheRules
}

export interface CacheRules {
  readonly env: readonly string[]
  readonly ignoreEnv: readonly string[]
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
      reserveCores?: unknown
      concurrentRuns?: unknown
    }
    affected?: Record<string, unknown>
    ledger?: { slowFileSeconds?: unknown; nearTimeoutRatio?: unknown; top?: unknown }
    triage?: { repeats?: unknown }
    cache?: { env?: unknown; ignoreEnv?: unknown }
  }
  const parallel = {
    memberDivisor: positive(raw.parallel?.memberDivisor, 'parallel.memberDivisor'),
    workerDivisor: positive(raw.parallel?.workerDivisor, 'parallel.workerDivisor'),
    maxWorkersPerMember: positiveInteger(
      raw.parallel?.maxWorkersPerMember,
      'parallel.maxWorkersPerMember',
    ),
    minimum: positiveInteger(raw.parallel?.minimum, 'parallel.minimum'),
    memoryPerWorkerMiB: positive(raw.parallel?.memoryPerWorkerMiB, 'parallel.memoryPerWorkerMiB'),
    sampleMs: nonNegativeInteger(raw.parallel?.sampleMs, 'parallel.sampleMs'),
    reserveCores: nonNegativeInteger(raw.parallel?.reserveCores, 'parallel.reserveCores'),
    concurrentRuns: positiveInteger(raw.parallel?.concurrentRuns, 'parallel.concurrentRuns'),
  }
  if (parallel.minimum > parallel.maxWorkersPerMember)
    throw new Error('parallel.minimum 不能大于 parallel.maxWorkersPerMember')
  return {
    parallel,
    affected: parseAffected(raw.affected),
    ledger: {
      slowFileSeconds: positive(raw.ledger?.slowFileSeconds, 'ledger.slowFileSeconds'),
      nearTimeoutRatio: ratio(raw.ledger?.nearTimeoutRatio, 'ledger.nearTimeoutRatio'),
      top: positiveInteger(raw.ledger?.top, 'ledger.top'),
    },
    triage: { repeats: positiveInteger(raw.triage?.repeats, 'triage.repeats') },
    cache: {
      env: strings(raw.cache?.env, 'cache.env'),
      ignoreEnv: strings(raw.cache?.ignoreEnv, 'cache.ignoreEnv'),
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

export const MEMBER_CONCURRENCY_ENV = 'OMNE_TEST_MEMBER_CONCURRENCY'
export const VITEST_MAX_WORKERS_ENV = 'VITEST_MAX_WORKERS'

function positiveIntegerOverride(
  env: Readonly<Record<string, string | undefined>>,
  name: string,
  fallback: number,
): number {
  const value = env[name]
  if (value === undefined || value === '') return fallback
  if (!/^[1-9]\d*$/u.test(value)) throw new Error(`环境变量 ${name} 须为正整数，现在是 ${value}`)
  return Number(value)
}

export function workerCountOverride(
  env: Readonly<Record<string, string | undefined>>,
  fallback: number,
): number {
  return positiveIntegerOverride(env, VITEST_MAX_WORKERS_ENV, fallback)
}

export function effectiveParallelism(
  config: TestRunsConfig,
  env: Readonly<Record<string, string | undefined>>,
  budget: Budget,
): Parallelism {
  const derived = deriveParallelism(budget, config.parallel)
  return {
    memberConcurrency: positiveIntegerOverride(
      env,
      MEMBER_CONCURRENCY_ENV,
      derived.memberConcurrency,
    ),
    vitestMaxWorkers: workerCountOverride(env, derived.vitestMaxWorkers),
  }
}
