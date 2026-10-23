import { appendFileSync } from 'node:fs'
import type { Reporter, Vitest } from 'vitest/node'

/** The sandbox runner records one JSON line per run in the file this variable names. */
export const RUN_LOG_ENV = 'OMNE_MUTATION_RUN_LOG'

/** One Vitest run inside Stryker: the dry run or one mutant run. */
export interface RunRecord {
  /** `dry-run` or `mutant`, as the Stryker Vitest runner provides it; `unknown` when it could not be read. */
  readonly mode: string
  /** The active mutant id; absent in the dry run. */
  readonly activeMutant?: string
  /** Type tests (typecheck pool) that this run reported. Absent when the count failed. */
  readonly typeTests?: number
  /** Whether the resolved config enables type checking. Absent when the count failed. */
  readonly typecheck?: boolean
  /** Why the count failed; the CLI then reports the type tests as not measured. */
  readonly error?: string
}

export function isRunRecord(value: unknown): value is RunRecord {
  if (typeof value !== 'object' || value === null) return false
  const record = new Map<string, unknown>(Object.entries(value))
  const activeMutant = record.get('activeMutant')
  if (typeof record.get('mode') !== 'string') return false
  if (activeMutant !== undefined && typeof activeMutant !== 'string') return false
  if (record.has('error')) return typeof record.get('error') === 'string'
  return Number.isInteger(record.get('typeTests')) && typeof record.get('typecheck') === 'boolean'
}

/**
 * It counts the type tests of each run. The count is report-only, so it must never change or fail a run:
 * any error, including a change of the experimental `vitest.state` API, becomes an `error` record, and a
 * failed write leaves the record out. The CLI shows both as "not measured".
 * Vitest 4.1.11 reports type tests only on the first run of an instance (#649), so a static mutant run
 * in a reused worker silently has none. The CLI compares each static run with the dry run.
 */
export default class RunReporter implements Reporter {
  #vitest: Vitest | undefined

  onInit(vitest: Vitest): void {
    this.#vitest = vitest
  }

  onTestRunEnd(): void {
    const log = process.env[RUN_LOG_ENV]
    if (log === undefined || log === '' || this.#vitest === undefined) return
    const record = measure(this.#vitest)
    if (record === undefined) return
    try {
      appendFileSync(log, `${JSON.stringify(record)}\n`)
    } catch {
      // A missing record reads as "not measured"; the run itself stays unaffected.
    }
  }
}

function measure(vitest: Vitest): RunRecord | undefined {
  let mode = 'unknown'
  try {
    const provided = new Map<string, unknown>(Object.entries(vitest.getProvidedContext()))
    const providedMode = provided.get('mode')
    // The preflight in sandbox-build runs outside Stryker and has no mode.
    if (typeof providedMode !== 'string') return undefined
    mode = providedMode
    const activeMutant = provided.get('activeMutant')
    // Count from the state that the Stryker runner reads (`ctx.state.getFiles()`), not from the
    // onTestRunEnd argument: on a rerun the argument still carries the typecheck module of the first run.
    const typeTests = vitest.state
      .getTestModules()
      .filter(module => module.toTestSpecification().pool === 'typecheck')
      .reduce((sum, module) => sum + [...module.children.allTests()].length, 0)
    return {
      mode,
      ...(mode === 'mutant' && typeof activeMutant === 'string' ? { activeMutant } : {}),
      typeTests,
      typecheck: vitest.config.typecheck.enabled === true,
    }
  } catch (error) {
    return { mode, error: describe(error) }
  }
}

function describe(error: unknown): string {
  try {
    return error instanceof Error ? error.message : String(error)
  } catch {
    return 'the error could not be formatted'
  }
}
