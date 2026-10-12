import { expect, test, vi } from 'vitest'
import { LosslessNumber, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { type StorageUnit } from '@omne-harness-lite/storage'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import type { SessionLogParticipant } from '@omne-harness-lite/session-log'
import { originalRecordFixture, recordValue } from './original-record-fixture.ts'
import { at, ref, scope } from './execution-owner-fixture.ts'

function unknownCompletion(unit: StorageUnit): StorageUnit {
  return new Proxy(unit, {
    get(target, property) {
      if (property === 'observeCompletion') return () => Promise.resolve('unknown' as const)
      const value = Reflect.get(target, property, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

async function unresolvedWrite(f: Awaited<ReturnType<typeof originalRecordFixture>>) {
  const input = await f.commitInput()
  const atomic = f.support.storage.atomic.bind(f.support.storage)
  vi.spyOn(f.support.storage, 'atomic').mockImplementationOnce(use =>
    atomic(unit => use(unknownCompletion(unit))),
  )
  let batch: Parameters<SessionLogParticipant['appendIn']>[2] | undefined
  f.appendIn.mockImplementationOnce(async (_unit, _access, supplied) => {
    batch = supplied
    return { failure: 'unavailable' }
  })
  expect(await f.journal.commit(input)).toEqual({ kind: 'rejected', reason: 'unavailable' })
  return {
    input,
    async completeOriginal() {
      if (!batch) throw new Error('missing original staged batch')
      return atomic(async unit => {
        const source = await f.support.log.sourceIn(unit, f.support.access, scope)
        if ('failure' in source) throw new Error('source unavailable')
        return f.log.participant.appendIn(unit, f.support.access, batch!, source.source)
      })
    },
  }
}

test.each(['ref', 'origin', 'expected', 'values'])(
  'record commit rejects a %s accessor without invoking it or writing',
  async field => {
    const f = await originalRecordFixture()
    try {
      const input = await f.commitInput()
      const get = vi.fn(() => {
        throw new Error('caller getter')
      })
      Object.defineProperty(input, field, { enumerable: true, get })
      f.readByKeyIn.mockClear()
      expect(await f.journal.commit(input)).toEqual({ kind: 'rejected', reason: 'invalidInput' })
      expect(get).not.toHaveBeenCalled()
      expect(f.readByKeyIn).not.toHaveBeenCalled()
      expect(f.appendIn).not.toHaveBeenCalled()
    } finally {
      await f.close()
    }
  },
)

test('record commit captures ref, origin, coordinates and values before awaiting storage', async () => {
  const f = await originalRecordFixture()
  try {
    const input = await f.commitInput()
    const work = f.journal.commit(input)
    input.ref.callId = unwrap(parseOpaqueIdentifier('foreign-call', 'CallId'))
    input.origin.run = 'foreign-run'
    input.expected.ownerGeneration = 'foreign-owner'
    input.values.length = 0
    expect(await work).toHaveProperty('kind', 'view')
    expect(
      (await f.read()).executions.get(ref.callId)?.contextReads[0]?.value.values[0]?.value,
    ).toBe('original')
    expect(f.appendIn).toHaveBeenCalledTimes(1)
    expect(f.readSince).not.toHaveBeenCalled()
    expect(f.append).not.toHaveBeenCalled()
  } finally {
    await f.close()
  }
})

test('closed record commit does not inspect a caller object', async () => {
  const f = await originalRecordFixture()
  try {
    const input = await f.commitInput()
    await f.journal.close()
    const trap = vi.fn(() => {
      throw new Error('caller prototype trap')
    })
    const supplied = new Proxy(input, { getPrototypeOf: trap })
    expect(await f.journal.commit(supplied)).toEqual({ kind: 'rejected', reason: 'unavailable' })
    expect(trap).not.toHaveBeenCalled()
  } finally {
    await f.close()
  }
})

test('a stale actual source rejects without appending a competing record', async () => {
  const f = await originalRecordFixture()
  try {
    const input = await f.commitInput()
    await f.marker('independent-record')
    expect(await f.journal.commit(input)).toEqual({ kind: 'rejected', reason: 'tailChanged' })
    expect(f.appendIn).not.toHaveBeenCalled()
    expect((await f.read()).executions.get(ref.callId)?.contextReads).toHaveLength(0)
  } finally {
    await f.close()
  }
})

test('one actual atomic batch preserves lossless context values and rejects impossible transitions', async () => {
  const f = await originalRecordFixture()
  try {
    const input = await f.commitInput()
    input.values = [1, 2].map(readIndex =>
      recordValue({
        revision: 1,
        ref,
        kind: 'execution_context_read',
        readIndex,
        values: [
          {
            key: 'workspace',
            revision: String(readIndex),
            value: new LosslessNumber('9007199254740993'),
            observedAt: at,
          },
        ],
      }),
    )
    expect(await f.journal.commit(input)).toHaveProperty('kind', 'view')
    const values = (await f.read()).executions.get(ref.callId)!.contextReads
    expect(values).toHaveLength(2)
    expect(writeJsonLossless(values[0]?.value.values[0]?.value)).toBe('9007199254740993')
    expect(f.appendIn).toHaveBeenCalledTimes(1)
    expect(f.appendIn.mock.calls[0]?.[2].entries).toHaveLength(2)
    const invalid = await f.commitInput()
    invalid.values = [
      recordValue({ revision: 1, ref, kind: 'execution_context_read', readIndex: 4, values: [] }),
    ]
    expect(await f.journal.commit(invalid)).toEqual({ kind: 'rejected', reason: 'conflict' })
    expect(f.appendIn).toHaveBeenCalledTimes(1)
  } finally {
    await f.close()
  }
})

test('a lost commit return recognizes the exact original records without a replacement append', async () => {
  const f = await originalRecordFixture()
  const loss = f.loseNextCommit('execution_context_read')
  try {
    expect(await f.journal.commit(await f.commitInput())).toEqual({
      kind: 'rejected',
      reason: 'unavailable',
    })
    expect(loss.matched()).toBe(true)
    expect((await f.read()).executions.get(ref.callId)?.contextReads).toHaveLength(1)
    expect(f.appendIn).toHaveBeenCalledTimes(1)
  } finally {
    loss.restore()
    await f.close()
  }
})

test('a confirming read failure retains the exact landed batch until same-instance close', async () => {
  const f = await originalRecordFixture()
  const append = f.appendIn.getMockImplementation()!
  f.appendIn.mockImplementationOnce(async (...args) => {
    const result = await append(...args)
    f.readByKeyIn.mockResolvedValueOnce({ failure: 'unavailable' })
    return result
  })
  try {
    expect(await f.journal.commit(await f.commitInput())).toEqual({
      kind: 'rejected',
      reason: 'unavailable',
    })
    await f.journal.close()
    expect(f.appendIn).toHaveBeenCalledTimes(1)
    const read = await f.log.readSince(scope.session, 0)
    expect(read).not.toHaveProperty('failure')
  } finally {
    await f.close()
  }
})

test('an unresolved native write blocks later records and failed close retries only recognition', async () => {
  const f = await originalRecordFixture()
  let pending: Awaited<ReturnType<typeof unresolvedWrite>> | undefined
  try {
    pending = await unresolvedWrite(f)
    expect(await f.journal.read(scope, ref.callId)).toEqual({
      kind: 'rejected',
      reason: 'unavailable',
    })
    expect(await f.journal.commit(pending.input)).toEqual({
      kind: 'rejected',
      reason: 'unavailable',
    })
    expect(f.appendIn).toHaveBeenCalledTimes(1)
    const closing = f.journal.close()
    expect(f.journal.close()).toBe(closing)
    await expect(closing).rejects.toThrow('unresolved Tool record writes')
    expect(await pending.completeOriginal()).not.toHaveProperty('failure')
    const retry = f.journal.close()
    expect(f.journal.close()).toBe(retry)
    await retry
    expect(f.appendIn).toHaveBeenCalledTimes(1)
    expect(await f.log.readSince(scope.session, 0)).not.toHaveProperty('failure')
  } finally {
    if (pending) await pending.completeOriginal()
    await f.close()
  }
})

test('known rollback releases the record decision without replaying the failed append', async () => {
  const f = await originalRecordFixture()
  try {
    f.appendIn.mockResolvedValueOnce({ failure: 'unavailable' })
    expect(await f.journal.commit(await f.commitInput())).toEqual({
      kind: 'rejected',
      reason: 'unavailable',
    })
    expect((await f.read()).executions.get(ref.callId)?.contextReads).toHaveLength(0)
    expect(await f.journal.commit(await f.commitInput())).toHaveProperty('kind', 'view')
    expect(f.appendIn).toHaveBeenCalledTimes(2)
  } finally {
    await f.close()
  }
})

test('close waits for the original atomic write and does not close borrowed SQLite', async () => {
  const f = await originalRecordFixture()
  const entered = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>()
  const append = f.appendIn.getMockImplementation()!
  f.appendIn.mockImplementationOnce(async (...args) => {
    const result = await append(...args)
    entered.resolve()
    await release.promise
    return result
  })
  try {
    const work = f.journal.commit(await f.commitInput())
    await entered.promise
    let closed = false
    const closing = f.journal.close().then(() => {
      closed = true
    })
    await Promise.resolve()
    expect(closed).toBe(false)
    expect(await f.journal.read(scope, ref.callId)).toEqual({
      kind: 'rejected',
      reason: 'unavailable',
    })
    release.resolve()
    await work
    await closing
    expect(await f.log.readSince(scope.session, 0)).not.toHaveProperty('failure')
    expect(f.appendIn).toHaveBeenCalledTimes(1)
  } finally {
    release.resolve()
    await f.close()
  }
})

test('the private snapshot contains only the original call records and the actual shared tail', async () => {
  const f = await originalRecordFixture()
  try {
    await f.marker('unrelated-session-fact')
    const view = await f.read()
    expect(view.prefix.entries).toHaveLength(2)
    expect(view.prefix.tail).toBe(3)
    expect([...view.executions.keys()]).toEqual([ref.callId])
    expect(f.readSince).not.toHaveBeenCalled()
    expect(f.append).not.toHaveBeenCalled()
  } finally {
    await f.close()
  }
})

test.each(['missing record', 'changed position'] as const)(
  'recognition refuses an original batch with a %s',
  async failure => {
    const f = await originalRecordFixture()
    const loss = f.loseNextCommit('execution_context_read')
    try {
      const input = await f.commitInput()
      input.values.push(
        recordValue({ revision: 1, ref, kind: 'execution_context_read', readIndex: 2, values: [] }),
      )
      expect(await f.journal.commit(input)).toEqual({ kind: 'rejected', reason: 'unavailable' })
      const read = f.readByKeyIn.getMockImplementation()!
      f.readByKeyIn.mockImplementationOnce(async (...args) => {
        const result = await read(...args)
        if ('failure' in result) return result
        const entries = result.entries.map(entry => ({ ...entry }))
        if (failure === 'missing record') entries.pop()
        else entries[entries.length - 1]!.position = 100
        return { ...result, entries }
      })
      expect(await f.journal.read(scope, ref.callId)).toEqual({
        kind: 'rejected',
        reason: 'unavailable',
      })
      expect((await f.read()).executions.get(ref.callId)?.contextReads).toHaveLength(2)
      await f.journal.close()
      expect(f.appendIn).toHaveBeenCalledTimes(1)
    } finally {
      loss.restore()
      await f.close()
    }
  },
)

test('recognizing an existing batch uses its original positions and performs no new append', async () => {
  const f = await originalRecordFixture()
  try {
    const input = await f.commitInput()
    expect(await f.journal.commit(input)).toHaveProperty('kind', 'view')
    const committed = await f.read()
    expect(await f.journal.commit({ ...input, expected: committed.prefix })).toHaveProperty(
      'kind',
      'view',
    )
    expect((await f.read()).executions.get(ref.callId)?.contextReads).toHaveLength(1)
    expect(f.appendIn).toHaveBeenCalledTimes(1)
    await f.journal.close()
  } finally {
    await f.close()
  }
})
