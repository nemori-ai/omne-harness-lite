import { describe, expect, it } from 'vitest'
import {
  parseRetryPolicy,
  runWithRetry,
  type Attempted,
  type RetryRuntime,
} from '@omne-harness/retry'

const policy = parseRetryPolicy({
  maxAttempts: 3,
  maxElapsedMs: 1000,
  delaysMs: [100, 200],
  jitter: 0,
})

interface FakeRuntime extends RetryRuntime {
  readonly waits: { delayMs: number; signal: AbortSignal | undefined }[]
}

function fakeRuntime(options: { wait?: RetryRuntime['wait']; step?: number } = {}): FakeRuntime {
  let clock = 0
  const waits: FakeRuntime['waits'] = []
  return {
    waits,
    now: () => clock,
    random: () => 0,
    wait: async (delayMs, signal) => {
      waits.push({ delayMs, signal })
      clock += delayMs + (options.step ?? 0)
      if (options.wait !== undefined) await options.wait(delayMs, signal)
    },
  }
}

function scripted<T>(results: readonly Attempted<T>[]) {
  const calls: number[] = []
  const attempt = async (n: number): Promise<Attempted<T>> => {
    calls.push(n)
    const result = results[n - 1]
    if (result === undefined) throw new Error(`no scripted result for attempt ${n}`)
    return result
  }
  return { attempt, calls }
}

const fail = (cause: string): Attempted<string> => ({ kind: 'retryable', cause })
const done = (value: string): Attempted<string> => ({ kind: 'done', value })

describe('runWithRetry', () => {
  it('returns the first success without waiting', async () => {
    const runtime = fakeRuntime()
    const { attempt, calls } = scripted([done('ok')])
    await expect(runWithRetry(policy, attempt, runtime)).resolves.toEqual({
      kind: 'done',
      value: 'ok',
      attempts: 1,
    })
    expect(calls).toEqual([1])
    expect(runtime.waits).toEqual([])
  })

  it('waits the policy delays between two failures and a success and reports each retry', async () => {
    const runtime = fakeRuntime()
    const controller = new AbortController()
    const retries: unknown[] = []
    const { attempt, calls } = scripted([fail('a'), fail('b'), done('ok')])
    await expect(
      runWithRetry(policy, attempt, runtime, {
        signal: controller.signal,
        onRetry: retry => retries.push(retry),
      }),
    ).resolves.toEqual({ kind: 'done', value: 'ok', attempts: 3 })
    expect(calls).toEqual([1, 2, 3])
    expect(runtime.waits).toEqual([
      { delayMs: 100, signal: controller.signal },
      { delayMs: 200, signal: controller.signal },
    ])
    expect(retries).toEqual([
      { attempt: 2, delayMs: 100, cause: 'a' },
      { attempt: 3, delayMs: 200, cause: 'b' },
    ])
  })

  it('is exhausted by attempts with the last cause', async () => {
    const runtime = fakeRuntime()
    const { attempt, calls } = scripted([fail('a'), fail('b'), fail('c')])
    await expect(runWithRetry(policy, attempt, runtime)).resolves.toEqual({
      kind: 'exhausted',
      by: 'attempts',
      attempts: 3,
      lastCause: 'c',
    })
    expect(calls).toEqual([1, 2, 3])
    expect(runtime.waits.map(each => each.delayMs)).toEqual([100, 200])
  })

  it('is exhausted by elapsed time measured from the first attempt', async () => {
    const runtime = fakeRuntime({ step: 750 })
    const { attempt, calls } = scripted([fail('a'), fail('b'), done('never')])
    await expect(runWithRetry(policy, attempt, runtime)).resolves.toEqual({
      kind: 'exhausted',
      by: 'elapsed',
      attempts: 2,
      lastCause: 'b',
    })
    expect(calls).toEqual([1, 2])
  })

  it('lets an exception from an attempt escape without retrying', async () => {
    const runtime = fakeRuntime()
    const boom = new Error('boom')
    const attempt = async (): Promise<Attempted<string>> => {
      throw boom
    }
    await expect(runWithRetry(policy, attempt, runtime)).rejects.toBe(boom)
    expect(runtime.waits).toEqual([])
  })

  it('returns aborted without an attempt when the signal is already aborted', async () => {
    const runtime = fakeRuntime()
    const controller = new AbortController()
    controller.abort()
    const { attempt, calls } = scripted([done('never')])
    await expect(
      runWithRetry(policy, attempt, runtime, { signal: controller.signal }),
    ).resolves.toEqual({ kind: 'aborted', attempts: 0 })
    expect(calls).toEqual([])
  })

  it('returns aborted when the signal fires during a wait that resolves', async () => {
    const controller = new AbortController()
    const runtime = fakeRuntime({ wait: async () => controller.abort() })
    const { attempt, calls } = scripted([fail('a'), done('never')])
    await expect(
      runWithRetry(policy, attempt, runtime, { signal: controller.signal }),
    ).resolves.toEqual({ kind: 'aborted', attempts: 1 })
    expect(calls).toEqual([1])
  })

  it('returns aborted when the wait rejects because of the abort', async () => {
    const controller = new AbortController()
    const runtime = fakeRuntime({
      wait: async () => {
        controller.abort()
        throw new DOMException('aborted', 'AbortError')
      },
    })
    const { attempt, calls } = scripted([fail('a'), done('never')])
    await expect(
      runWithRetry(policy, attempt, runtime, { signal: controller.signal }),
    ).resolves.toEqual({ kind: 'aborted', attempts: 1 })
    expect(calls).toEqual([1])
  })

  it('lets a wait rejection for another reason escape', async () => {
    const broken = new Error('timer broke')
    const runtime = fakeRuntime({
      wait: async () => {
        throw broken
      },
    })
    const { attempt } = scripted([fail('a'), done('never')])
    await expect(
      runWithRetry(policy, attempt, runtime, { signal: new AbortController().signal }),
    ).rejects.toBe(broken)
  })
})
