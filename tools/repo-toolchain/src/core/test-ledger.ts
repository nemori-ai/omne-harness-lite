import { join } from 'node:path'

export const RUN_SCRIPTS = ['test', 'acceptance'] as const
export type RunScript = (typeof RUN_SCRIPTS)[number]

const LEDGER_HOMES: Readonly<Record<RunScript, { readonly env: string; readonly dir: string }>> = {
  test: { env: 'OMNE_TEST_LEDGER_HOME', dir: 'test-ledger' },
  acceptance: { env: 'OMNE_ACCEPTANCE_LEDGER_HOME', dir: 'acceptance-ledger' },
}

export function isRunScript(value: unknown): value is RunScript {
  return (RUN_SCRIPTS as readonly unknown[]).includes(value)
}

export const RUN_TIERS = ['fast', 'slow', 'all'] as const
export type RunTier = (typeof RUN_TIERS)[number]

export function isRunTier(value: unknown): value is RunTier {
  return (RUN_TIERS as readonly unknown[]).includes(value)
}

export const TIER_NAMES: Readonly<Record<RunTier, string>> = {
  fast: '快层',
  slow: '慢层',
  all: '两层',
}

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
  readonly memberConcurrency: number
  readonly vitestMaxWorkers: number
}

export interface RunMeta {
  readonly script: RunScript
  readonly tier: RunTier
  readonly head: string
  readonly branch: string
  readonly dirty: boolean
  readonly base: { readonly ref: string; readonly mergeBase: string } | null
  readonly startedAt: string
  readonly parallel: Parallelism
  readonly cores: number
  readonly plan: { readonly mode: 'full' | 'scoped'; readonly reason: string } | null
  readonly scope?: { readonly reason: string; readonly skipped: readonly string[] }
  readonly members: readonly string[]
  readonly wallSeconds: number
}

export interface LedgerFile extends Ledger {
  readonly meta: RunMeta
}

export interface Failure {
  readonly member: string
  readonly file?: string
  readonly test?: string
  readonly message: string
}

export interface Ledger {
  readonly members: readonly {
    readonly member: string
    readonly exitCode: number
    readonly wallSeconds: number
    readonly files: number
    readonly tests: number
    readonly skipped: number
    readonly failed: number
    readonly fileSeconds: number
    readonly collectSeconds?: number
  }[]
  readonly files: readonly {
    readonly member: string
    readonly file: string
    readonly seconds: number
    readonly tests: number
    readonly slowTests: number
    readonly fastSeconds: number
    readonly longestSeconds: number
    readonly collectSeconds?: number
  }[]
  readonly nearTimeout: readonly {
    readonly member: string
    readonly file: string
    readonly test: string
    readonly seconds: number
    readonly timeoutSeconds: number
    readonly timeoutAssumed: boolean
    readonly slow: boolean
  }[]
  readonly fastOverBudget: readonly {
    readonly member: string
    readonly file: string
    readonly test: string
    readonly seconds: number
  }[]
  readonly failures: readonly Failure[]
}
