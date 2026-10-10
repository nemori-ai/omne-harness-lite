import { expect, test } from 'vitest'
import { access, at, deferred, fixture, ref, request, scope } from './execution-owner-fixture.ts'

function interruptionValue(reason: string) {
  return {
    kind: 'execution_ended',
    revision: 1,
    ref,
    terminal: { outcome: 'interrupted', reason },
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
            text: 'interrupted',
          },
        ],
        outcome: 'interrupted',
        reason: { code: 'user_interrupted', text: reason },
      },
      pass: 'after-action-pass',
      selectedChain: [],
    },
    account: {
      callId: ref.callId,
      initiator: ref.tenant,
      externalEffect: 'unknown',
      cost: { total_usd: 0, items: [] },
      frames: {
        emitted: 0,
        trims: {
          merged: 0,
          cut: 0,
          omittedBytes: 0,
          byReason: { rate_merged: 0, frame_too_long: 0, quota_exhausted: 0, rejected: 0 },
        },
      },
      wallClock: { startedAt: at, endedAt: at },
      stoppedAt: at,
    },
  }
}

test('second stop authorization refuses revocation during the original SQL read without abort or ending', async () => {
  const entered = deferred<AbortSignal>(),
    author = deferred<string>(),
    reading = deferred<void>(),
    readGate = deferred<void>()
  const f = await fixture(async (_args, dependencies) => {
    entered.resolve(dependencies.signal)
    return author.promise
  })
  try {
    expect(await f.owner.operations.submit(request)).toEqual({ kind: 'recorded', execution: ref })
    const signal = await entered.promise
    const before = await f.log.readSince(scope.session, 0)
    if ('failure' in before) throw new Error('original SQL prefix unavailable')
    f.authorize.mockClear()
    f.readSince.mockImplementationOnce(async (...args) => {
      reading.resolve()
      await readGate.promise
      return f.log.readSince(...args)
    })
    const pending = f.owner.operations.stop(access, ref, 'revoked-stop')
    await reading.promise
    expect(f.authorize).toHaveBeenCalledExactlyOnceWith(access, scope, 'tool.stop')
    f.revoke()
    readGate.resolve()
    expect(await pending).toBe('notAuthorized')
    expect(f.authorize.mock.calls).toEqual([
      [access, scope, 'tool.stop'],
      [access, scope, 'tool.stop'],
    ])
    expect(signal.aborted).toBe(false)
    expect(f.prepareDelivery).not.toHaveBeenCalled()
    expect(f.implementation).toHaveBeenCalledOnce()
    expect(await f.log.readSince(scope.session, 0)).toEqual(before)
  } finally {
    readGate.resolve()
    author.resolve('cleanup-original-author')
    await f.close()
  }
})

test('stop confirms the entire SQLite terminal account and delivery before aborting its original author', async () => {
  const entered = deferred<AbortSignal>(),
    author = deferred<string>(),
    appending = deferred<void>(),
    receiptGate = deferred<void>()
  const f = await fixture(async (_args, dependencies) => {
    entered.resolve(dependencies.signal)
    return author.promise
  })
  try {
    expect(await f.owner.operations.submit(request)).toEqual({ kind: 'recorded', execution: ref })
    const signal = await entered.promise
    let held = false
    f.append.mockImplementation(async (...args) => {
      if (!held && args[1].some(entry => entry.dedupeKey?.includes('execution_ended'))) {
        held = true
        appending.resolve()
        await receiptGate.promise
      }
      return f.log.append(...args)
    })
    const pending = f.owner.operations.stop(access, ref, 'original-stop')
    await appending.promise
    expect(signal.aborted).toBe(false)
    receiptGate.resolve()
    expect(await pending).toBe('stopped')
    expect(signal.aborted).toBe(true)
    expect(signal.reason).toBe('original-stop')
    const confirmed = await f.journal.read(scope, ref.callId)
    if (confirmed.kind !== 'view') throw new Error('confirmed SQL ending unavailable')
    expect(confirmed.executions.get(ref.callId)?.terminal?.value).toEqual(
      interruptionValue('original-stop'),
    )
    author.resolve('late-author-result')
    await f.owner.idle()
    const final = await f.journal.read(scope, ref.callId)
    if (final.kind !== 'view') throw new Error('final SQL ending unavailable')
    expect(final.executions.get(ref.callId)?.terminal?.value).toEqual(
      interruptionValue('original-stop'),
    )
    expect(
      f.append.mock.calls.filter(call =>
        call[1].some(entry => entry.dedupeKey?.includes('execution_ended')),
      ),
    ).toHaveLength(1)
    expect(f.implementation).toHaveBeenCalledOnce()
  } finally {
    receiptGate.resolve()
    author.resolve('cleanup-original-author')
    await f.close()
  }
})

test('lost stop receipt is recognized without early abort and original close settles the retained author', async () => {
  const entered = deferred<AbortSignal>(),
    author = deferred<string>()
  const f = await fixture(async (_args, dependencies) => {
    const finish = () => author.resolve('after-original-abort')
    dependencies.signal.addEventListener('abort', finish, { once: true })
    entered.resolve(dependencies.signal)
    try {
      return await author.promise
    } finally {
      dependencies.signal.removeEventListener('abort', finish)
    }
  })
  try {
    expect(await f.owner.operations.submit(request)).toEqual({ kind: 'recorded', execution: ref })
    const signal = await entered.promise
    let lost = false
    f.append.mockImplementation(async (...args) => {
      const result = await f.log.append(...args)
      if (!lost && args[1].some(entry => entry.dedupeKey?.includes('execution_ended'))) {
        lost = true
        return { failure: 'unavailable' }
      }
      return result
    })
    expect(await f.owner.operations.stop(access, ref, 'original-stop')).toBe('unavailable')
    expect(signal.aborted).toBe(false)
    expect(await f.owner.operations.stop(access, ref, 'replacement-stop')).toBe('alreadyEnded')
    expect(signal.aborted).toBe(false)
    const view = await f.journal.read(scope, ref.callId)
    if (view.kind !== 'view') throw new Error('recognized SQL ending unavailable')
    expect(view.executions.get(ref.callId)?.terminal?.value).toEqual(
      interruptionValue('original-stop'),
    )
    expect(f.prepareDelivery).toHaveBeenCalledOnce()
    await f.owner.close()
    expect(signal.aborted).toBe(true)
    expect(signal.reason).toBe('owner_closed')
    expect(f.implementation).toHaveBeenCalledOnce()
    expect(
      f.append.mock.calls.filter(call =>
        call[1].some(entry => entry.dedupeKey?.includes('execution_ended')),
      ),
    ).toHaveLength(1)
  } finally {
    author.resolve('cleanup-original-author')
    await f.close()
  }
})

test('non-TypeError reference capture remains outside stop refusal handling', async () => {
  const f = await fixture(),
    error = new Error('original-ref-trap')
  const hostile = new Proxy(ref, {
    getPrototypeOf() {
      throw error
    },
  })
  try {
    await expect(f.owner.operations.stop(access, hostile, 'stop')).rejects.toBe(error)
    expect(f.authorize).not.toHaveBeenCalled()
    expect(f.readSince).not.toHaveBeenCalled()
    expect(f.append).not.toHaveBeenCalled()
  } finally {
    await f.close()
  }
})

test('authorization rejection inside stop returns unavailable before any existence read', async () => {
  const f = await fixture()
  try {
    f.authorize.mockRejectedValueOnce(new Error('original-authorization-failure'))
    expect(await f.owner.operations.stop(access, ref, 'stop')).toBe('unavailable')
    expect(f.authorize).toHaveBeenCalledExactlyOnceWith(access, scope, 'tool.stop')
    expect(f.readSince).not.toHaveBeenCalled()
    expect(f.append).not.toHaveBeenCalled()
  } finally {
    await f.close()
  }
})
