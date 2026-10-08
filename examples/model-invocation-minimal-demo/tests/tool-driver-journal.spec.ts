import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import { attemptStartedPayload } from '@omne-harness-lite/session-runtime'
import { expect, test, vi } from 'vitest'
import type {
  AppendRequest,
  SessionLog,
  SessionLogOwnerOperations,
} from '@omne-harness-lite/session-log'
import type { SessionAccess } from '@omne-harness-lite/session-tenancy'
import type { RecoveryAccess } from '@omne-harness-lite/execution-environments'
import { createToolDriverJournal } from '../src/tool-driver-journal.ts'
import {
  captureModelLogValue,
  prepareModelLogEntry,
} from '@omne-harness-lite/model-request-runtime'
import { projectToolDriverHistory } from '../src/tool-driver-history.ts'
import {
  at,
  dk,
  historyFixture,
  officialPiece,
  origin,
  scope,
} from './tool-driver-history-fixture.ts'

async function fixture() {
  const f = await historyFixture(),
    release = vi.fn(async () => {})
  const append = vi.fn<SessionLog['append']>((...args) => f.log.append(...args))
  const owner: SessionLogOwnerOperations = {
    async enumerate() {
      return { kind: 'rejected', reason: 'notAuthorized' }
    },
    async readPrefix() {
      return { kind: 'prefix', prefix: await f.prefix() }
    },
    async borrow() {
      return {
        kind: 'borrowed',
        ownerGeneration: f.log.backing.ownerGeneration,
        log: { ...f.log, append },
        release,
      }
    },
  }
  const opened = await createToolDriverJournal({
    owner,
    access: {} as SessionAccess,
    recovery: {} as RecoveryAccess,
    scope,
  })
  if (opened.kind !== 'journal') throw new Error('journal fixture')
  const key = await f.conclusion()
  const complete = {
    kind: 'actions_completed',
    origin,
    adoption: f.adoption,
    chain: [officialPiece()],
    completion: {
      key: dk(['actions', origin.assistantMessage]),
      gate: { kind: 'available' },
      items: [
        {
          callId: 'call',
          effectiveCall: f.calls[0],
          anchor: 'action-call',
          conclusions: [key],
          decision: { kind: 'allow', conclusion: key },
        },
      ],
    },
  }
  return {
    f,
    journal: opened,
    append,
    release,
    owner,
    complete,
    async close() {
      await opened.close()
      await f.close()
    },
  }
}

async function nextAttempt(f: Awaited<ReturnType<typeof fixture>>) {
  const history = projectToolDriverHistory(await f.f.prefix())
  const previous = history.runs.get('run')?.latest?.value
  if (previous === undefined) throw new Error('missing adoption fixture')
  const prepared = {
    tenant: scope.tenant,
    run: 'run',
    attempt: 2,
    dedupeKey: 'session-runtime/attempt/2',
    readKeys: ['session-runtime/attempts'],
    payload: attemptStartedPayload({
      kind: 'attempt_started',
      run: 'run',
      attempt: 2,
      reason: 'resumed_after_wait',
      at,
    }),
  }
  const copied = copyJsonValue(prepared.payload)
  if ('failed' in copied) throw Error('fixture fact payload')
  return {
    value: {
      ...previous,
      attempt: 2,
      adoption: dk(['attempt', 'run', '2e0']),
      report: { ...previous.report, attempt: 2 },
      startedFactKey: prepared.dedupeKey,
    },
    entry: { ...prepared, payload: copied.ok },
  }
}

test('publishes adoption and its checked attempt fact in one physical append', async () => {
  const f = await fixture()
  try {
    const next = await nextAttempt(f)
    expect(await f.journal.commit(next.value)).toEqual({ kind: 'rejected', reason: 'invalidInput' })
    expect(f.append).not.toHaveBeenCalled()
    expect(await f.journal.commit(next.value, next.entry)).toHaveProperty('kind', 'committed')
    expect(f.append).toHaveBeenCalledTimes(1)
    expect(f.append.mock.calls[0]?.[1]).toHaveLength(2)
    expect(
      projectToolDriverHistory(await f.f.prefix()).runs.get('run')?.latest?.value.attempt,
    ).toBe(2)
    expect(await f.journal.commit(next.value, next.entry)).toHaveProperty('kind', 'committed')
    expect(f.append).toHaveBeenCalledTimes(1)
  } finally {
    await f.close()
  }
})
test('never recognizes a partially visible unknown two-member batch as complete', async () => {
  const f = await fixture()
  const next = await nextAttempt(f)
  try {
    // Deliberately violate physical atomicity to test recognition, not to claim SQL commits partially.
    f.append.mockImplementationOnce(async (session, entries, fence, condition) => {
      const first = entries[0]
      if (!first) throw new Error('missing first member')
      await f.f.log.append(session, [first], fence, condition)
      return { failure: 'unavailable' }
    })
    expect(await f.journal.commit(next.value, next.entry)).toEqual({
      kind: 'rejected',
      reason: 'unavailable',
    })
    expect(await f.journal.commit(next.value, next.entry)).toEqual({
      kind: 'rejected',
      reason: 'unavailable',
    })
    await expect(f.journal.close()).rejects.toThrow('unresolved batch')
    expect(f.release).not.toHaveBeenCalled()
    expect(f.append).toHaveBeenCalledTimes(1)
  } finally {
    await f.f.close()
  }
})

test('publishes the checked original batch at the actual read tail, and recognizes exact reentry', async () => {
  const f = await fixture()
  try {
    const before = await f.f.prefix()
    expect(await f.journal.commit(f.complete)).toHaveProperty('kind', 'committed')
    expect(f.append.mock.calls[0]?.[3]).toEqual({ kind: 'tailEquals', tail: before.tail })
    expect(await f.journal.commit(f.complete)).toHaveProperty('kind', 'committed')
    expect(f.append).toHaveBeenCalledTimes(1)
    expect(await f.journal.commit({ ...f.complete, adoption: 'different' })).toEqual({
      kind: 'rejected',
      reason: 'conflict',
    })
    expect(f.append).toHaveBeenCalledTimes(1)
  } finally {
    await f.close()
  }
})
test('a real concurrent attempt advance makes the old batch fail rather than adopting a newer tail', async () => {
  const f = await fixture()
  try {
    f.append.mockImplementationOnce(async (...args) => {
      await f.f.attempt(2)
      return f.f.log.append(...args)
    })
    // The physical owner gives attemptSuperseded precedence over the competing tail condition.
    expect(await f.journal.commit(f.complete)).toEqual({ kind: 'rejected', reason: 'conflict' })
    expect(await f.journal.commit(f.complete)).toEqual({ kind: 'rejected', reason: 'conflict' })
    expect(f.append).toHaveBeenCalledTimes(1)
  } finally {
    await f.close()
  }
})
test('a same-attempt competing commit returns tailChanged and permits a fresh, fully checked retry', async () => {
  const f = await fixture()
  try {
    f.append.mockImplementationOnce(async (...args) => {
      await f.f.append([
        f.f.model('record', {
          kind: 'model_call_created',
          call: 'concurrent-model',
          creationKey: 'concurrent-create',
          payload: {
            kind: 'created',
            locator: 'concurrent-model',
            version: 'v1',
            digest: 'a'.repeat(64),
          },
          createdAt: at,
        }),
      ])
      return f.f.log.append(...args)
    })
    expect(await f.journal.commit(f.complete)).toEqual({ kind: 'rejected', reason: 'tailChanged' })
    expect(await f.journal.commit(f.complete)).toHaveProperty('kind', 'committed')
    expect(f.append).toHaveBeenCalledTimes(2)
  } finally {
    await f.close()
  }
})
test('a failed release remains visible and retryable without reopening admission', async () => {
  const f = await fixture()
  try {
    f.release.mockRejectedValueOnce(new Error('release failure'))
    await expect(f.journal.close()).rejects.toThrow('release failure')
    expect(await f.journal.commit(f.complete)).toEqual({ kind: 'rejected', reason: 'unavailable' })
    await f.journal.close()
    expect(f.release).toHaveBeenCalledTimes(2)
  } finally {
    await f.close()
  }
})
test.each(['unavailable', 'throw'] as const)(
  'recognizes a real persisted batch after a lost %s receipt without appending twice',
  async mode => {
    const f = await fixture()
    try {
      f.append.mockImplementationOnce(async (...args) => {
        const actual = await f.f.log.append(...args)
        if ('failure' in actual) throw new Error(actual.failure)
        if (mode === 'throw') throw new Error('lost receipt')
        return { failure: 'unavailable' }
      })
      expect(await f.journal.commit(f.complete)).toEqual({
        kind: 'rejected',
        reason: 'unavailable',
      })
      expect(await f.journal.commit(f.complete)).toHaveProperty('kind', 'committed')
      expect(f.append).toHaveBeenCalledTimes(1)
    } finally {
      await f.close()
    }
  },
)
test('an absent unknown batch blocks every later route and release until the original actual write appears', async () => {
  const f = await fixture()
  let pending: AppendRequest | undefined
  try {
    f.append.mockImplementationOnce(async (session, entries, fence, condition) => {
      pending = { session, entries: entries as AppendRequest['entries'], fence, condition }
      return { failure: 'unavailable' }
    })
    expect(await f.journal.commit(f.complete)).toEqual({ kind: 'rejected', reason: 'unavailable' })
    expect(
      await f.journal.commit({ kind: 'run_started', run: 'other', inboundKey: 'unused', at }),
    ).toEqual({ kind: 'rejected', reason: 'unavailable' })
    await expect(f.journal.close()).rejects.toThrow('unresolved batch')
    expect(f.release).not.toHaveBeenCalled()
    if (!pending) throw new Error('no captured unknown write')
    expect(
      await f.f.log.append(pending.session, pending.entries, pending.fence, pending.condition),
    ).not.toHaveProperty('failure')
    await f.journal.close()
    expect(f.release).toHaveBeenCalledTimes(1)
    expect(await f.journal.read()).toEqual({ unavailable: true })
  } finally {
    await f.close()
  }
})
test('captures a caller value before yielding and rejects message getters without invoking them', async () => {
  const f = await fixture()
  try {
    const submitted = f.journal.commit(f.complete)
    f.complete.adoption = 'changed-after-call'
    expect(await submitted).toHaveProperty('kind', 'committed')
    const getter = vi.fn(() => 'forged')
    const companion = Object.defineProperty({}, 'dedupeKey', { enumerable: true, get: getter })
    expect(await f.journal.commit(f.complete, companion as never)).toEqual({
      kind: 'rejected',
      reason: 'invalidInput',
    })
    expect(getter).not.toHaveBeenCalled()
  } finally {
    await f.close()
  }
})
test('close waits for the actual append promise, closes admission immediately, and releases once', async () => {
  const f = await fixture()
  let resolve!: () => void
  const barrier = new Promise<void>(done => {
    resolve = done
  })
  let entered!: () => void
  const started = new Promise<void>(done => {
    entered = done
  })
  try {
    f.append.mockImplementationOnce(async (...args) => {
      entered()
      await barrier
      return f.f.log.append(...args)
    })
    const work = f.journal.commit(f.complete)
    await started
    const closing = f.journal.close()
    expect(await f.journal.commit(f.complete)).toEqual({ kind: 'rejected', reason: 'unavailable' })
    expect(f.release).not.toHaveBeenCalled()
    resolve()
    expect(await work).toHaveProperty('kind', 'committed')
    await closing
    await f.journal.close()
    expect(f.release).toHaveBeenCalledTimes(1)
  } finally {
    resolve()
    await f.close()
  }
})

test.each(['generation', 'scope'] as const)(
  'close does not release an unknown original batch using a different %s recovery prefix',
  async difference => {
    const f = await fixture()
    try {
      f.append.mockImplementationOnce(async (...args) => {
        const actual = await f.f.log.append(...args)
        if ('failure' in actual) throw new Error(actual.failure)
        return { failure: 'unavailable' }
      })
      expect(await f.journal.commit(f.complete)).toEqual({
        kind: 'rejected',
        reason: 'unavailable',
      })
      const read = vi.spyOn(f.owner, 'readPrefix')
      read.mockImplementation(async () => {
        const prefix = await f.f.prefix()
        return {
          kind: 'prefix',
          prefix:
            difference === 'generation'
              ? { ...prefix, ownerGeneration: 'another-generation' }
              : {
                  ...prefix,
                  scope: {
                    ...prefix.scope,
                    tenant: {
                      ...prefix.scope.tenant,
                      account: 'other-user' as typeof prefix.scope.tenant.account,
                    },
                  },
                },
        }
      })
      await expect(f.journal.close()).rejects.toThrow('unresolved batch')
      expect(f.release).not.toHaveBeenCalled()
      expect(await f.journal.commit(f.complete)).toEqual({
        kind: 'rejected',
        reason: 'unavailable',
      })
      read.mockRestore()
      await f.journal.close()
      expect(f.release).toHaveBeenCalledTimes(1)
      expect(f.append).toHaveBeenCalledTimes(1)
    } finally {
      await f.close()
    }
  },
)
