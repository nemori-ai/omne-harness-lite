// How `runContractApi` reads the result of the pinned CLI process, how `toolchainManifest` reads a
// failed lookup and how `unavailableOnKnown` sorts errors. The process and the lookup are stand-ins
// here; the real CLI runs in integration-contract-check.spec.ts.
import { describe, expect, it } from 'vitest'
import {
  runContractApi,
  toolchainManifest,
  unavailableOnKnown,
  type ProcessResult,
  type ProcessRunner,
} from '../src/integration/contract-api.ts'
import { IntegrationError } from '../src/integration/parse.ts'

const COMMAND = { file: '/node', args: ['/cli.js'] }
const OPTIONS = { root: '/checkout', timeoutMs: 1234 }
const ended = (over: Partial<ProcessResult>): ProcessResult => ({
  status: 0,
  signal: null,
  stdout: '',
  stderr: '',
  ...over,
})
const run = (result: ProcessResult, seen: Parameters<ProcessRunner>[] = []) =>
  runContractApi(COMMAND, ['--check', '--json'], OPTIONS, (...call) => {
    seen.push(call)
    return result
  })

describe('runContractApi', () => {
  it('starts the CLI with its own arguments, then the root, and the limits of the call', () => {
    const seen: Parameters<ProcessRunner>[] = []
    expect(run(ended({ stdout: '{"ok":true}' }), seen)).toEqual({
      kind: 'ran',
      stdout: '{"ok":true}',
    })
    const [file, args, options] = seen[0] ?? []
    expect(file).toBe('/node')
    expect(args).toEqual(['/cli.js', '--check', '--json', '--root', '/checkout'])
    expect(options).toMatchObject({ cwd: '/checkout', encoding: 'utf8', timeout: 1234 })
    expect(options?.env?.['OMNE_SUBJECT_ROOT']).toBe('/checkout')
    expect(options?.env?.['OMNE_RUNNER_ROOT']).toBe('/checkout')
  })

  it('names the time limit when the process timed out', () => {
    const error = Object.assign(new Error('spawnSync ETIMEDOUT'), { code: 'ETIMEDOUT' })
    expect(run(ended({ error, status: null }))).toEqual({
      kind: 'unavailable',
      reason: 'omne-contract-api 在 1234 毫秒内没有结束，已终止。',
    })
  })

  it('gives the error code and message when the process failed another way', () => {
    const error = Object.assign(new Error('spawnSync /node ENOENT'), { code: 'ENOENT' })
    expect(run(ended({ error, status: null }))).toEqual({
      kind: 'unavailable',
      reason: 'omne-contract-api 进程出错（ENOENT）：spawnSync /node ENOENT',
    })
  })

  it('says there was no error code when the error has none', () => {
    expect(run(ended({ error: new Error('boom'), status: null }))).toEqual({
      kind: 'unavailable',
      reason: 'omne-contract-api 进程出错（无错误码）：boom',
    })
  })

  it('gives the exit code and the trimmed standard error of a failed run', () => {
    expect(run(ended({ status: 3, stderr: '  broken\n' }))).toEqual({
      kind: 'unavailable',
      reason: 'omne-contract-api 退出码 3：broken',
    })
  })

  it('gives only the exit code when the standard error is empty, blank or missing', () => {
    const only = { kind: 'unavailable', reason: 'omne-contract-api 退出码 2' }
    expect(run(ended({ status: 2, stderr: ' \n' }))).toEqual(only)
    expect(run(ended({ status: 2, stderr: null }))).toEqual(only)
  })

  it('gives the signal when a signal ended the process', () => {
    expect(run(ended({ status: null, signal: 'SIGKILL' }))).toEqual({
      kind: 'unavailable',
      reason: 'omne-contract-api 退出码 null（信号 SIGKILL）',
    })
    expect(run(ended({ status: null, signal: null }))).toEqual({
      kind: 'unavailable',
      reason: 'omne-contract-api 退出码 null（信号 未知）',
    })
  })
})

describe('toolchainManifest', () => {
  it('looks up the repo-toolchain package from this module', () => {
    const seen: unknown[][] = []
    const found = toolchainManifest((...call) => {
      seen.push(call)
      return '/modules/repo-toolchain/package.json'
    })
    expect(found).toBe('/modules/repo-toolchain/package.json')
    expect(seen[0]?.[0]).toBe('@omne-harness/repo-toolchain')
    expect(String(seen[0]?.[1])).toMatch(/^file:\/\/.*contract-api\.ts$/)
  })

  it('is undefined when the lookup finds nothing or fails with ERR_MODULE_NOT_FOUND', () => {
    expect(toolchainManifest(() => undefined)).toBeUndefined()
    expect(
      toolchainManifest(() => {
        throw Object.assign(new Error('not found'), { code: 'ERR_MODULE_NOT_FOUND' })
      }),
    ).toBeUndefined()
  })

  it('passes any other failure on', () => {
    const other = Object.assign(new Error('denied'), { code: 'EACCES' })
    expect(() =>
      toolchainManifest(() => {
        throw other
      }),
    ).toThrow(other)
    expect(() =>
      toolchainManifest(() => {
        throw Object.assign(new Error('no code'), { code: undefined })
      }),
    ).toThrow('no code')
    expect(() =>
      toolchainManifest(() => {
        throw new Error('plain')
      }),
    ).toThrow('plain')
    expect(() =>
      toolchainManifest(() => {
        throw 'not an error'
      }),
    ).toThrow('not an error')
  })
})

describe('unavailableOnKnown', () => {
  it('returns what the step returns', () => {
    expect(
      unavailableOnKnown(
        () => 7,
        () => 'unused',
      ),
    ).toBe(7)
  })

  it('turns an IntegrationError into unavailable with the reason `describe` gives', () => {
    const failure = new IntegrationError('input-error', 'bad shape')
    expect(
      unavailableOnKnown(
        () => {
          throw failure
        },
        error => `reason: ${error.message}`,
      ),
    ).toEqual({ kind: 'unavailable', reason: 'reason: bad shape' })
  })

  it('passes any other error on', () => {
    const other = new Error('unexpected')
    expect(() =>
      unavailableOnKnown(
        () => {
          throw other
        },
        () => 'unused',
      ),
    ).toThrow(other)
  })
})
