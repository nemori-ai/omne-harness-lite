import { describe, expect, it } from 'vitest'
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
