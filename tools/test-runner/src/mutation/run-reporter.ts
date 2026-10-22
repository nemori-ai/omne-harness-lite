import { appendFileSync } from 'node:fs'
import type { Reporter, Vitest } from 'vitest/node'

/** The sandbox runner records one JSON line per run in the file this variable names. */
export const RUN_LOG_ENV = 'OMNE_MUTATION_RUN_LOG'

/** One Vitest run inside Stryker: the dry run or one mutant run. */
export interface RunRecord {
  /** `dry-run` or `mutant`, as the Stryker Vitest runner provides it. */
  readonly mode: string
  /** The active mutant id; absent in the dry run. */
  readonly activeMutant?: string
  /** Type tests (typecheck pool) that this run reported. */
  readonly typeTests: number
}

export function isRunRecord(value: unknown): value is RunRecord {
  if (typeof value !== 'object' || value === null) return false
  const record = new Map<string, unknown>(Object.entries(value))
  const activeMutant = record.get('activeMutant')
  return (
    typeof record.get('mode') === 'string' &&
    Number.isInteger(record.get('typeTests')) &&
    (activeMutant === undefined || typeof activeMutant === 'string')
  )
}

/**
 * It counts the type tests of each run and does not change test results. A failed write is not hidden:
 * the error fails the run, and Stryker records a RuntimeError that invalidates the member.
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
    // The preflight in sandbox-build runs outside Stryker and has no mode.
    const provided = new Map<string, unknown>(Object.entries(this.#vitest.getProvidedContext()))
    const mode = provided.get('mode')
    if (typeof mode !== 'string') return
    const activeMutant = provided.get('activeMutant')
    // Count from the state that the Stryker runner reads (`ctx.state.getFiles()`), not from the modules argument:
    // on a rerun the argument still carries the typecheck module of the first run with its old results.
    const typeTests = this.#vitest.state
      .getTestModules()
      .filter(module => module.toTestSpecification().pool === 'typecheck')
      .reduce((sum, module) => sum + [...module.children.allTests()].length, 0)
    const record: RunRecord = {
      mode,
      ...(mode === 'mutant' && typeof activeMutant === 'string' ? { activeMutant } : {}),
      typeTests,
    }
    appendFileSync(log, `${JSON.stringify(record)}\n`)
  }
}
