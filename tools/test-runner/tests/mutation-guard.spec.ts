import { describe, expect, it } from 'vitest'
import {
  DryRunStatus,
  MutantRunStatus,
  type DryRunOptions,
  type DryRunResult,
  type MutantRunResult,
  type MutantRunOptions,
  type TestRunner,
} from '@stryker-mutator/api/test-runner'
import { guardMutantRun } from '../src/mutation/guarded-vitest.ts'
import { isMutationReport, runtimeError, type MutationReport } from '../src/mutation/report.ts'

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
  const capabilities = { reloadEnvironment: true }
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
  it('preserves this, options, lifecycle and normal result identity', async () => {
    const fixture = runner()
    const wrapped = guardMutantRun(fixture.original)
    await wrapped.capabilities()
    await wrapped.init?.()
    expect(await wrapped.dryRun(dryOptions)).toBe(fixture.dryResult)
    expect(await wrapped.mutantRun(options)).toBe(fixture.result)
    await wrapped.dispose?.()
    expect(fixture.calls).toEqual(['capabilities', 'init', 'dryRun', 'mutantRun', 'dispose'])
  })

  // Vitest reports type tests only on the first start of an instance; the upstream runner reuses its instance
  // although it claims to reload. Without a real reload, static runs after the dry run silently lose type tests.
  it('declares no in-process reload, so Stryker restarts the worker before each static mutant (#649)', async () => {
    const { original } = runner()
    await expect(guardMutantRun(original).capabilities()).resolves.toEqual({
      reloadEnvironment: false,
    })
    original.capabilities = async () => ({ reloadEnvironment: true })
    await expect(guardMutantRun(original).capabilities()).resolves.toEqual({
      reloadEnvironment: false,
    })
  })

  it('does not hide capabilities failure', async () => {
    const { original } = runner()
    const failure = new Error('capabilities')
    original.capabilities = () => {
      throw failure
    }
    await expect(guardMutantRun(original).capabilities()).rejects.toBe(failure)
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

it('invalidates RuntimeError anywhere in the raw report, but does not expand to CompileError', () => {
  const report: MutationReport = {
    files: {
      'outside.ts': {
        source: '',
        mutants: [
          {
            id: '0',
            mutatorName: 'BlockStatement',
            status: 'RuntimeError',
            location: { start: { line: 900, column: 1 }, end: { line: 900, column: 2 } },
          },
        ],
      },
    },
  }
  expect(runtimeError(report, 'member', 'raw.json')).toContain('1 个 RuntimeError')
  const compileOnly: MutationReport = {
    files: {
      'outside.ts': {
        source: '',
        mutants: [
          {
            id: '0',
            mutatorName: 'BlockStatement',
            status: 'CompileError',
            location: { start: { line: 900, column: 1 }, end: { line: 900, column: 2 } },
          },
        ],
      },
    },
  }
  expect(runtimeError(compileOnly, 'member', 'raw.json')).toBeUndefined()
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
