import type { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { runSupervisor, supervisePlan } from '../src/local/supervise-command.ts'

type Versions = NonNullable<Parameters<typeof runSupervisor>[1]['versions']>

/** A supervisor over children that leave with the given codes, one after another, as soon as they are started. */
function supervised(codes: readonly number[], versions: Versions) {
  const started: (string | undefined)[] = []
  const said: string[] = []
  const left = [...codes]
  const result = runSupervisor(supervisePlan(['--fall-limit', '1']), {
    start(_args, version) {
      started.push(version)
      const stdout = Object.assign(new EventEmitter(), { setEncoding: () => stdout })
      const child = Object.assign(new EventEmitter(), { pid: started.length, stdout })
      queueMicrotask(() => child.emit('exit', left.shift() ?? 0, null))
      return child as unknown as ChildProcess
    },
    stdout: () => {},
    stderr: line => said.push(line),
    onStop: () => () => {},
    versions,
  })
  return { result, started, said }
}

describe('监督者与指针', () => {
  it('这一版以配置错退出，而指针这时已经指着别的一版：起那一版，不停下', async () => {
    let reads = 0
    const run = supervised([2, 2], {
      current: () => ((reads += 1) === 1 ? 'a' : 'b'),
      tell: () => ({ outcome: 'superseded', pointer: null }),
    })
    expect(await run.result).toBe(2)
    expect(run.started).toEqual(['a', 'b'])
    expect(run.said).toContain(
      'supervise: serve left with 2: a configuration error; the pointer names version b by now',
    )
    expect(run.said.at(-1)).toBe(
      'supervise: serve left with 2: a configuration error; it is not started again',
    )
  })

  it('到上限时指针已经指着别的一版：起那一版，倒下的次数从头算', async () => {
    const pointer = { current: 'b', previous: null, settled: false }
    let reads = 0
    const run = supervised([1, 0, 2], {
      current: () => ((reads += 1) === 1 ? 'a' : 'b'),
      tell: started =>
        started === 'a' ? { outcome: 'superseded', pointer } : { outcome: 'no-fallback', pointer },
    })
    expect(await run.result).toBe(2)
    expect(run.started).toEqual(['a', 'b', 'b'])
    expect(run.said).toContain(
      'supervise: version a left with 1, 1 times in a row before it settled; the pointer names version b by now',
    )
  })

  it('到上限时指针读不成：写明，照没有退路停下', async () => {
    const run = supervised([1], {
      current: () => 'a',
      tell: () => {
        throw new Error('current.json is not a pointer')
      },
    })
    expect(await run.result).toBe(1)
    expect(run.said.slice(-2)).toEqual([
      'supervise: the pointer was not read or written: current.json is not a pointer',
      'supervise: version a left with 1, 1 times in a row before it settled; there is no earlier version to go back to; it is not started again',
    ])
  })

  it('要起的时候没有指针指着的版本：写明，不起，以 2 结束', async () => {
    const run = supervised([], {
      current: () => {
        throw new Error('no version is switched to under /r')
      },
      tell: () => ({ outcome: 'superseded', pointer: null }),
    })
    expect(await run.result).toBe(2)
    expect(run.started).toEqual([])
    expect(run.said).toEqual([
      'supervise: no version is switched to under /r; serve is not started',
    ])
  })
})
