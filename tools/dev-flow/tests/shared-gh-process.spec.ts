// How `ghProcess` launches `gh` and how the default backoff waits. The launch and the wait are
// stand-ins here; the real `gh` child process is run in shared-gh.spec.ts (slow cases).
import { execFileSync } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ghCommand, ghProcess } from '../src/shared/gh.ts'

vi.mock('node:child_process', () => ({ execFileSync: vi.fn(() => '{"ok":true}') }))

afterEach(() => vi.restoreAllMocks())

const launch = vi.mocked(execFileSync)
/** The command, the arguments and the options of the one launch that the last call made. */
function lastLaunch() {
  const call = launch.mock.calls.at(-1)
  if (call === undefined) throw new Error('gh was not launched')
  const [file, args, options] = call as unknown as [
    string,
    string[],
    Record<string, unknown> & { stdio?: unknown },
  ]
  return { file, args, options }
}

describe('ghProcess', () => {
  it('starts gh by name, without a shell, with the given arguments and time limit, and returns its text', () => {
    const argv = ['api', 'repos/owner/repo']
    expect(ghProcess(argv, 1234)).toBe('{"ok":true}')
    const { file, args, options } = lastLaunch()
    expect(file).toBe('gh')
    expect(args).toEqual(argv)
    expect(options).toMatchObject({ encoding: 'utf8', timeout: 1234, shell: false })
  })

  it('accepts output larger than the 1 MiB default of a child process', () => {
    ghProcess(['api', 'x'], 1000)
    expect(lastLaunch().options['maxBuffer']).toBeGreaterThan(1024 * 1024)
  })

  it('gives a call without input no standard input', () => {
    ghProcess(['api', 'x'], 1000)
    const { options } = lastLaunch()
    expect(options.stdio).toEqual(['ignore', 'pipe', 'pipe'])
    expect(options).not.toHaveProperty('input')
  })

  it('hands the input text of a call to gh as its standard input', () => {
    ghProcess(['api', 'x', '--input', '-'], 1000, '{"title":"t"}')
    const { options } = lastLaunch()
    expect(options['input']).toBe('{"title":"t"}')
    expect(options).not.toHaveProperty('stdio')
  })
})

describe('the default backoff of ghCommand', () => {
  it('blocks the thread for the pause before the retry', () => {
    const wait = vi.spyOn(Atomics, 'wait').mockReturnValue('timed-out')
    let launches = 0
    const command = ghCommand(() => {
      launches += 1
      if (launches === 1) throw Object.assign(new Error('Command failed: gh'), { status: 1 })
      return '{}'
    })
    expect(command(['api', 'repos/owner/repo'], 1000)).toEqual({})
    expect(wait).toHaveBeenCalledTimes(1)
    expect(wait.mock.calls[0]?.slice(1)).toEqual([0, 0, 500])
  })
})
