import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type { Vitest } from 'vitest/node'
import {
  determineHitLimitReached,
  DryRunStatus,
  MutantRunStatus,
  type DryRunOptions,
  type DryRunResult,
  type MutantRunResult,
  type MutantRunOptions,
  type TestRunner,
} from '@stryker-mutator/api/test-runner'
import { guardMutantRun } from '../src/mutation/guarded-vitest.ts'
import {
  HIT_LIMIT_REASON,
  isMutationReport,
  memberErrors,
  memberLines,
  summarizeMember,
  wallClockTimeout,
  type MutationReport,
} from '../src/mutation/report.ts'
import RunReporter, { isRunRecord, RUN_LOG_ENV } from '../src/mutation/run-reporter.ts'
import type { MutationTarget } from '../src/mutation/scope.ts'

const dryOptions: DryRunOptions = { timeout: 1000, disableBail: false, coverageAnalysis: 'perTest' }
const options: MutantRunOptions = {
  timeout: 1000,
  disableBail: false,
  activeMutant: {
    id: '0',
    fileName: 'a.ts',
    mutatorName: 'BlockStatement',
    replacement: '{}',
    location: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } },
  },
  sandboxFileName: 'a.ts',
  mutantActivation: 'static',
  reloadEnvironment: true,
}

function runner() {
  const result = { status: MutantRunStatus.Survived, nrOfTests: 1 } satisfies MutantRunResult
  const dryResult = { status: DryRunStatus.Complete, tests: [] } satisfies DryRunResult
  const capabilities = { reloadEnvironment: false }
  const calls: string[] = []
  const original: TestRunner = {
    capabilities() {
      expect(this).toBe(original)
      calls.push('capabilities')
      return capabilities
    },
    async init() {
      expect(this).toBe(original)
      calls.push('init')
    },
    async dryRun(received) {
      expect(this).toBe(original)
      expect(received).toBe(dryOptions)
      calls.push('dryRun')
      return dryResult
    },
    async mutantRun(received) {
      expect(this).toBe(original)
      expect(received).toBe(options)
      calls.push('mutantRun')
      return result
    },
    async dispose() {
      expect(this).toBe(original)
      calls.push('dispose')
    },
  }
  return { original, calls, result, dryResult, capabilities }
}

describe('public TestRunner delegation', () => {
  it('preserves this, options, capabilities, lifecycle and normal result identity', async () => {
    const fixture = runner()
    const wrapped = guardMutantRun(fixture.original)
    expect(wrapped.capabilities()).toBe(fixture.capabilities)
    await wrapped.init?.()
    expect(await wrapped.dryRun(dryOptions)).toBe(fixture.dryResult)
    expect(await wrapped.mutantRun(options)).toBe(fixture.result)
    await wrapped.dispose?.()
    expect(fixture.calls).toEqual(['capabilities', 'init', 'dryRun', 'mutantRun', 'dispose'])
  })

  it('turns the first rejection into Error without retrying a runner that would recover', async () => {
    const { original, result } = runner()
    let attempts = 0
    original.mutantRun = async function () {
      expect(this).toBe(original)
      attempts += 1
      if (attempts === 1) throw new Error('one-shot failure')
      return result
    }
    expect(await guardMutantRun(original).mutantRun(options)).toEqual({
      status: MutantRunStatus.Error,
      errorMessage: expect.stringContaining('one-shot failure'),
    })
    expect(attempts).toBe(1)
  })

  it.each(['toString', 'stack'])('still resolves Error when %s formatting throws', async field => {
    const failure =
      field === 'stack'
        ? new Error('original failure')
        : {
            toString() {
              throw new Error('formatting failure')
            },
          }
    if (field === 'stack')
      Object.defineProperty(failure, 'stack', {
        get() {
          throw new Error('stack failure')
        },
      })
    const { original } = runner()
    let attempts = 0
    original.mutantRun = async () => {
      attempts += 1
      return Promise.reject(failure)
    }
    const result = await guardMutantRun(original).mutantRun(options)
    expect(result).toEqual({
      status: MutantRunStatus.Error,
      errorMessage: expect.stringContaining('could not be formatted'),
    })
    expect(attempts).toBe(1)
  })

  it.each(['init', 'dryRun', 'dispose'] as const)('does not hide %s failure', async method => {
    const { original } = runner()
    const failure = new Error(method)
    original[method] = async () => {
      throw failure
    }
    const wrapped = guardMutantRun(original)
    const pending = method === 'dryRun' ? wrapped.dryRun(dryOptions) : wrapped[method]?.()
    await expect(pending).rejects.toBe(failure)
  })

  it('supports absent optional lifecycle methods', async () => {
    const { original } = runner()
    delete original.init
    delete original.dispose
    const wrapped = guardMutantRun(original)
    await expect(wrapped.init?.()).resolves.toBeUndefined()
    await expect(wrapped.dispose?.()).resolves.toBeUndefined()
  })
})

const target: MutationTarget = {
  member: { path: 'member', name: '@x/member', script: 'vitest run', dependencies: [] },
  lines: new Map([['member/inside.ts', [[1, 1]] as const]]),
}
const at = (line: number) => ({ start: { line, column: 1 }, end: { line, column: 2 } })
function reportWith(outsideStatus: 'RuntimeError' | 'CompileError'): MutationReport {
  return {
    files: {
      'inside.ts': {
        source: 'x',
        mutants: [{ id: '0', mutatorName: 'BlockStatement', status: 'Killed', location: at(1) }],
      },
      'outside.ts': {
        source: '',
        mutants: [
          { id: '1', mutatorName: 'BlockStatement', status: outsideStatus, location: at(900) },
        ],
      },
    },
  }
}

it('invalidates RuntimeError anywhere in the raw report, keeps the member without a score, but does not expand to CompileError', () => {
  const invalid = summarizeMember(target, reportWith('RuntimeError'))
  expect(invalid).toMatchObject({ valid: false, score: null, runtimeErrors: 1, outside: 1 })
  expect(invalid.counts.Killed).toBe(1)
  expect(memberErrors(invalid, { logPath: 'log', reports: ['raw.json'] })).toEqual([
    'member：1 个 RuntimeError，成员测量无效，原始报告 raw.json',
  ])
  expect(memberLines(invalid, false)[0]).toContain('分数 —（测量无效）')
  const compileOnly = summarizeMember(target, reportWith('CompileError'))
  expect(compileOnly).toMatchObject({ valid: true, score: 100, runtimeErrors: 0 })
  expect(memberErrors(compileOnly, { logPath: 'log', reports: ['raw.json'] })).toEqual([])
})

// The scoring rule trusts this prefix to tell a hit-limit timeout from a wall-clock one (#649).
it('matches the hit-limit reason that the pinned Stryker API produces', () => {
  const reason = determineHitLimitReached(101, 100)?.reason
  expect(reason?.startsWith(HIT_LIMIT_REASON)).toBe(true)
  const mutant = { id: '0', mutatorName: 'BlockStatement', location: at(1) }
  expect(
    wallClockTimeout({
      ...mutant,
      status: 'Timeout',
      ...(reason === undefined ? {} : { statusReason: reason }),
    }),
  ).toBe(false)
  expect(wallClockTimeout({ ...mutant, status: 'Timeout' })).toBe(true)
  expect(wallClockTimeout({ ...mutant, status: 'Killed' })).toBe(false)
})

it('rejects malformed report statuses and locations before member scoring', () => {
  expect(isMutationReport({ files: {} })).toBe(true)
  expect(
    isMutationReport({ files: { 'a.ts': { source: '', mutants: [{ status: 'RuntimeError' }] } } }),
  ).toBe(false)
  expect(isMutationReport({ files: { 'a.ts': { source: '', mutants: 'RuntimeError' } } })).toBe(
    false,
  )
})

// The type-test count is report-only (#649): it must not fail a run, and a failure must read as "not measured".
describe('RunReporter', () => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'run-reporter-')))
  afterAll(() => rmSync(directory, { recursive: true, force: true }))
  const module = (pool: string, tests: number) => ({
    toTestSpecification: () => ({ pool }),
    children: { allTests: () => Array.from({ length: tests }) },
  })
  function vitest(
    provided: Record<string, unknown>,
    state: () => unknown,
    typecheck = true,
  ): Vitest {
    const fake = {
      getProvidedContext: () => provided,
      get state() {
        return state()
      },
      config: { typecheck: { enabled: typecheck } },
    }
    return fake as unknown as Vitest
  }
  function report(log: string, fake: Vitest): void {
    const previous = process.env[RUN_LOG_ENV]
    process.env[RUN_LOG_ENV] = log
    try {
      const reporter = new RunReporter()
      reporter.onInit(fake)
      reporter.onTestRunEnd()
    } finally {
      if (previous === undefined) delete process.env[RUN_LOG_ENV]
      else process.env[RUN_LOG_ENV] = previous
    }
  }
  const lines = (log: string) =>
    readFileSync(log, 'utf8')
      .split('\n')
      .filter(line => line !== '')
      .map(line => JSON.parse(line) as unknown)

  it('counts type tests from the Vitest state, with mode, mutant and the typecheck switch', () => {
    const log = join(directory, 'counts.jsonl')
    const state = () => ({ getTestModules: () => [module('typecheck', 2), module('threads', 5)] })
    report(log, vitest({ mode: 'dry-run' }, state))
    report(log, vitest({ mode: 'mutant', activeMutant: '7' }, state, false))
    // The preflight runs outside Stryker and provides no mode: no record.
    report(log, vitest({}, state))
    expect(lines(log)).toEqual([
      { mode: 'dry-run', typeTests: 2, typecheck: true },
      { mode: 'mutant', activeMutant: '7', typeTests: 2, typecheck: false },
    ])
    expect(lines(log).every(isRunRecord)).toBe(true)
  })

  it('records an error instead of failing the run when the experimental state API breaks', () => {
    const log = join(directory, 'broken.jsonl')
    expect(() =>
      report(
        log,
        vitest({ mode: 'dry-run' }, () => {
          throw new Error('state is gone')
        }),
      ),
    ).not.toThrow()
    expect(lines(log)).toEqual([{ mode: 'dry-run', error: 'state is gone' }])
    expect(isRunRecord(lines(log)[0])).toBe(true)
  })

  it('leaves the record out when the log cannot be written, without failing the run', () => {
    const state = () => ({ getTestModules: () => [] })
    expect(() =>
      report(join(directory, 'missing', 'dir', 'runs.jsonl'), vitest({ mode: 'dry-run' }, state)),
    ).not.toThrow()
  })

  it('rejects malformed records so that the CLI reads the log as not measured', () => {
    expect(isRunRecord({ mode: 'dry-run', typeTests: 1, typecheck: true })).toBe(true)
    expect(isRunRecord({ mode: 'dry-run', typeTests: 1 })).toBe(false)
    expect(isRunRecord({ mode: 'dry-run', typeTests: 1.5, typecheck: true })).toBe(false)
    expect(isRunRecord({ typeTests: 1, typecheck: true })).toBe(false)
    expect(isRunRecord({ mode: 'mutant', activeMutant: 3, typeTests: 1, typecheck: true })).toBe(
      false,
    )
    expect(isRunRecord({ mode: 'unknown', error: 7 })).toBe(false)
  })
})
