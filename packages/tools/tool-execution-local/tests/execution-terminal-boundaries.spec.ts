import { expect, test, vi } from 'vitest'
import { unwrap } from '@omne-harness-lite/identity-values'
import { instantFromRfc3339, type Clock } from '@omne-harness-lite/offer-expiry'
import { createTerminalCommitter } from '../src/execution-terminal.ts'
import {
  at,
  deferred,
  fixture,
  frozenDelivery,
  ref,
  request,
  scope,
} from './execution-owner-fixture.ts'

const endedAt = '2026-10-05T04:00:01.000Z'
function journalProbe(original: Parameters<typeof createTerminalCommitter>[0]['journal']) {
  const read = vi.fn(original.read),
    commit = vi.fn(original.commit)
  return { ...original, read, commit }
}
function terminalRequest() {
  return {
    ref: { ...ref },
    origin: { ...request.origin },
    terminal: { outcome: 'completed' as const, result: 'original-result' },
    delivery: frozenDelivery(
      { outcome: 'completed', result: 'original-result' },
      [],
      'original-pass',
    ),
    startedAt: at,
    frames: 'unknown' as const,
  }
}
function expectedValue(late: boolean) {
  return {
    kind: 'execution_ended',
    revision: 1,
    ref,
    terminal: { outcome: 'completed', result: 'original-result' },
    delivery: {
      result: {
        id: 'result-block',
        kind: 'tool_result',
        callId: ref.callId,
        visibility: { toHuman: true, toModel: true },
        blocks: [
          {
            id: 'result-text',
            kind: 'text',
            visibility: { toHuman: true, toModel: true },
            text: 'original-result',
          },
        ],
        outcome: 'completed',
      },
      pass: 'original-pass',
      selectedChain: [],
    },
    account: {
      callId: ref.callId,
      initiator: ref.tenant,
      externalEffect: 'unknown',
      cost: { total_usd: 0, items: [] },
      frames: 'unknown',
      wallClock: { startedAt: at, endedAt },
      ...(late ? { late: true } : {}),
    },
  }
}

test.each(['run-ended', 'attempt-changed'])(
  'one Clock suspension precedes the complete %s prefix decision',
  async marker => {
    const entered = deferred<void>(),
      author = deferred<string>(),
      clockGate = Promise.withResolvers<Awaited<ReturnType<Clock['now']>>>()
    const f = await fixture(async () => {
      entered.resolve()
      return author.promise
    })
    const clock: Clock = {
      now: vi.fn(async function (this: Clock) {
        expect(this).toBe(clock)
        return clockGate.promise
      }),
    }
    try {
      expect(await f.owner.operations.submit(request)).toEqual({ kind: 'recorded', execution: ref })
      await entered.promise
      const journal = journalProbe(f.journal),
        { read, commit } = journal,
        supplied = terminalRequest()
      const finish = createTerminalCommitter({ journal, clock, attempts: 2 })
      const pending = finish(supplied)
      expect(read).not.toHaveBeenCalled()
      await f.marker(marker)
      const prefix = await f.log.readSince(scope.session, 0)
      if ('failure' in prefix) throw new Error('original SQL prefix unavailable')
      supplied.terminal.result = 'replacement-result'
      Object.defineProperty(supplied.delivery, 'pass', { value: 'replacement-pass' })
      supplied.origin.attempt = 2
      supplied.startedAt = endedAt
      clockGate.resolve(unwrap(instantFromRfc3339(endedAt)))
      expect(await pending).toBe('recorded')
      expect(clock.now).toHaveBeenCalledOnce()
      expect(commit).toHaveBeenCalledOnce()
      expect(read.mock.contexts[0]).toBe(journal)
      expect(commit.mock.contexts[0]).toBe(journal)
      expect(commit.mock.calls[0]?.[0]).toEqual({
        ref,
        origin: request.origin,
        expected: {
          scope,
          ownerGeneration: f.backing.ownerGeneration,
          tail: prefix.tail,
          entries: prefix.entries,
        },
        values: [expectedValue(true)],
      })
      const view = await f.journal.read(scope, ref.callId)
      if (view.kind !== 'view') throw new Error('original SQL ending unavailable')
      expect(view.executions.get(ref.callId)?.terminal?.value).toEqual(expectedValue(true))
    } finally {
      clockGate.resolve(unwrap(instantFromRfc3339(endedAt)))
      author.resolve('cleanup-original-author')
      await f.close()
    }
  },
)

test.each([1, 2])(
  'tail conflict with %i attempts retries the last failure using the original receiver',
  async attempts => {
    const entered = deferred<void>(),
      author = deferred<string>()
    const f = await fixture(async () => {
      entered.resolve()
      return author.promise
    })
    const clock: Clock = { now: vi.fn(async () => unwrap(instantFromRfc3339(endedAt))) }
    const retry = vi.fn(async function (this: unknown, attempt: number) {
      expect(this).toBe(input)
      expect(attempt).toBe(0)
    })
    const journal = journalProbe(f.journal),
      input = { journal, clock, attempts, retry }
    try {
      expect(await f.owner.operations.submit(request)).toEqual({ kind: 'recorded', execution: ref })
      await entered.promise
      let competed = false
      f.append.mockImplementation(async (...args) => {
        if (!competed && args[1].some(entry => entry.dedupeKey?.includes('execution_ended'))) {
          competed = true
          await f.marker('attempt-changed')
        }
        return f.log.append(...args)
      })
      const { commit } = journal
      const finish = createTerminalCommitter(input)
      expect(await finish(terminalRequest())).toBe(attempts === 1 ? 'unavailable' : 'recorded')
      expect(clock.now).toHaveBeenCalledOnce()
      expect(retry).toHaveBeenCalledExactlyOnceWith(0)
      expect(commit).toHaveBeenCalledTimes(attempts)
      expect(commit.mock.calls[0]?.[0].values).toEqual([expectedValue(false)])
      const view = await f.journal.read(scope, ref.callId)
      if (view.kind !== 'view') throw new Error('original SQL tail unavailable')
      if (attempts === 1) {
        expect(view.executions.get(ref.callId)?.terminal).toBeUndefined()
      } else {
        expect(commit.mock.calls[1]?.[0].values).toEqual([expectedValue(true)])
        expect(commit.mock.calls[1]?.[0].expected.tail).not.toEqual(
          commit.mock.calls[0]?.[0].expected.tail,
        )
        expect(view.executions.get(ref.callId)?.terminal?.value).toEqual(expectedValue(true))
      }
    } finally {
      author.resolve('cleanup-original-author')
      await f.close()
    }
  },
)

test('unavailable Clock performs no journal read or commit', async () => {
  const f = await fixture(),
    clock: Clock = { now: vi.fn(async (): Promise<'unavailable'> => 'unavailable') }
  try {
    const journal = journalProbe(f.journal),
      { read, commit } = journal
    expect(await createTerminalCommitter({ journal, clock, attempts: 1 })(terminalRequest())).toBe(
      'unavailable',
    )
    expect(clock.now).toHaveBeenCalledOnce()
    expect(read).not.toHaveBeenCalled()
    expect(commit).not.toHaveBeenCalled()
  } finally {
    await f.close()
  }
})

test.each(['clock', 'journal', 'retry'] as const)(
  'original %s rejection retains its exception',
  async port => {
    const entered = deferred<void>(),
      author = deferred<string>(),
      error = new Error(`original-${port}`)
    const f = await fixture(async () => {
      entered.resolve()
      return author.promise
    })
    const clock: Clock = { now: vi.fn(async () => unwrap(instantFromRfc3339(endedAt))) },
      retry = vi.fn(async () => {})
    try {
      await f.owner.operations.submit(request)
      await entered.promise
      const journal = journalProbe(f.journal)
      if (port === 'clock') vi.mocked(clock.now).mockRejectedValueOnce(error)
      if (port === 'journal') journal.read.mockRejectedValueOnce(error)
      if (port === 'retry') {
        journal.commit.mockResolvedValueOnce({
          kind: 'rejected',
          reason: 'tailChanged',
        })
        retry.mockRejectedValueOnce(error)
      }
      await expect(
        createTerminalCommitter({ journal, clock, attempts: 1, retry })(terminalRequest()),
      ).rejects.toBe(error)
    } finally {
      author.resolve('cleanup-original-author')
      await f.close()
    }
  },
)
