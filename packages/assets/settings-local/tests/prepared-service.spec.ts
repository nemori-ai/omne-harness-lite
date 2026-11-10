import { afterEach, expect, it } from 'vitest'
import { definition, definitionRef } from './world.ts'
import { intentAttemptIdentity } from '../src/intent-records.ts'
import { digest, json } from '../src/encoding.ts'
import { stored } from './business-world.ts'
import { openPreparedServiceWorld } from './prepared-service-world.ts'
const worlds: Awaited<ReturnType<typeof openPreparedServiceWorld>>[] = []
async function open(
  configure?: Parameters<typeof openPreparedServiceWorld>[0],
  bound?: Parameters<typeof openPreparedServiceWorld>[1],
) {
  const world = await openPreparedServiceWorld(configure, bound)
  worlds.push(world)
  return world
}
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})
it('keeps the state, the original operation and value-free changes across reopening the SQL provider', async () => {
  const first = await open()
  const prepared = await first.service.prepareChange(first.context, first.command)
  if (prepared.kind !== 'prepared') throw new Error(JSON.stringify(prepared))
  const committed = await first.service.commitChange(first.context, {
    requestId: 'commit',
    preparation: prepared.preparation,
  })
  expect(committed).toMatchObject({ kind: 'committed', revision: 1, changed: true })
  worlds.splice(worlds.indexOf(first), 1)
  await first.close()
  const { target } = first.command
  const reopened = await open(undefined, { root: first.root, scopeRef: target.scopeRef })
  expect(stored(first.root)).toMatchObject({
    state: {
      state: {
        revision: 1,
        sources: [
          { id: 'tenant', values: [{ itemId: 'enabled', value: { kind: 'value', value: true } }] },
        ],
      },
    },
    operations: 1,
    changes: 1,
    terminals: 1,
  })
  expect(
    await reopened.service.getOperation(reopened.context, prepared.preparation.operation),
  ).toEqual(committed)
  // A change names the item and the source and carries no value.
  expect(
    await reopened.service.readChanges(reopened.context, { target, afterRevision: 0, limit: 10 }),
  ).toEqual({
    kind: 'changes',
    changes: [
      {
        kind: 'value',
        revision: 1,
        operationId: first.command.operationId,
        itemId: 'enabled',
        sourceId: 'tenant',
      },
    ],
    nextRevision: null,
  })
})

it('separates protected preparation from commit and recognizes the original result', async () => {
  const w = await open()
  const prepared = await w.service.prepareChange(w.context, w.command)
  expect(prepared).toMatchObject({ kind: 'prepared' })
  if (prepared.kind !== 'prepared') throw new Error(JSON.stringify(prepared))
  expect(w.requests).toHaveLength(1)
  expect(await w.service.getOperation(w.context, prepared.preparation.operation)).toMatchObject({
    kind: 'pending',
    attempt: { state: 'prepared' },
  })
  expect(
    await w.service.readChanges(w.context, {
      target: w.command.target,
      afterRevision: 0,
      limit: 10,
    }),
  ).toMatchObject({ kind: 'changes', changes: [] })
  const commit = { requestId: 'commit', preparation: prepared.preparation }
  const result = await w.service.commitChange(w.context, commit)
  expect(result).toMatchObject({ kind: 'committed', revision: 1, changed: true })
  expect(await w.service.commitChange(w.context, commit)).toEqual(result)
  expect(await w.service.prepareChange(w.context, { ...w.command, requestId: 'retry' })).toEqual(
    result,
  )
  expect(
    await w.service.cancelChange(w.context, {
      requestId: 'cancel',
      operation: prepared.preparation.operation,
    }),
  ).toEqual(result)
  expect(
    await w.service.readChanges(w.context, {
      target: w.command.target,
      afterRevision: 0,
      limit: 10,
    }),
  ).toMatchObject({
    kind: 'changes',
    changes: [{ revision: 1, operationId: w.command.operationId }],
  })
})
it('reauthorizes queries and rejects changed semantic commands or forged preparation bindings', async () => {
  const w = await open()
  const prepared = await w.service.prepareChange(w.context, w.command)
  if (prepared.kind !== 'prepared') throw new Error(JSON.stringify(prepared))
  expect(
    await w.service.getOperation({ ...w.context, allowed: false }, prepared.preparation.operation),
  ).toEqual({ kind: 'rejected', reason: 'forbidden' })
  expect(
    await w.service.prepareChange(w.context, {
      ...w.command,
      action: { kind: 'set', value: false },
    }),
  ).toEqual({ kind: 'rejected', reason: 'operation_conflict' })
  expect(
    await w.service.commitChange(w.context, {
      requestId: 'forged',
      preparation: { ...prepared.preparation, commandDigest: 'a'.repeat(64) },
    }),
  ).toEqual({ kind: 'rejected', reason: 'operation_conflict' })
  expect(
    await w.service.commitChange(w.context, {
      requestId: 'forged',
      preparation: { ...prepared.preparation, attemptId: 'other' },
    }),
  ).toEqual({ kind: 'rejected', reason: 'operation_conflict' })
})
it('cancels the exact preparation and cannot revive it', async () => {
  const w = await open()
  const prepared = await w.service.prepareChange(w.context, w.command)
  if (prepared.kind !== 'prepared') throw new Error(JSON.stringify(prepared))
  expect(
    await w.service.cancelChange(w.context, {
      requestId: 'cancel',
      operation: prepared.preparation.operation,
    }),
  ).toMatchObject({ kind: 'aborted', reason: 'cancelled' })
  expect(
    await w.service.commitChange(w.context, {
      requestId: 'late',
      preparation: prepared.preparation,
    }),
  ).toMatchObject({ kind: 'aborted', reason: 'cancelled' })
  expect(await w.service.prepareChange(w.context, w.command)).toMatchObject({
    kind: 'aborted',
    reason: 'cancelled',
  })
  expect(w.requests).toHaveLength(1)
})

it('recovers a lost reservation reply with the same persisted request and attempt', async () => {
  let lost = true
  const w = await open(options => ({
    ...options,
    standing: {
      ...options.standing,
      async reserve(context, request) {
        const result = await options.standing.reserve(context, request)
        if (lost) {
          lost = false
          throw new Error('reply lost')
        }
        return result
      },
    },
  }))
  const operation = { target: w.command.target, operationId: w.command.operationId }
  expect(await w.service.prepareChange(w.context, w.command)).toEqual({
    kind: 'unknown',
    operation,
  })
  const pending = await w.service.getOperation(w.context, operation)
  if (pending.kind !== 'pending' || pending.attempt?.state !== 'preparing')
    throw new Error(JSON.stringify(pending))
  const prepared = await w.service.prepareChange(w.context, w.command)
  expect(prepared).toMatchObject({
    kind: 'prepared',
    preparation: { attemptId: pending.attempt.attemptId },
  })
  expect(w.requests).toHaveLength(2)
  expect(w.requests[0]).toEqual(w.requests[1])
})

it.each(['settings.ready', 'settings.attempt.commit'])(
  'recognizes durable work after losing the %s response',
  async operationName => {
    let lost = true
    const w = await open(options => ({
      ...options,
      storage: {
        ...options.storage,
        async commit(request) {
          const result = await options.storage.commit(request)
          if (request.identity.operation === operationName && result.kind === 'committed' && lost) {
            lost = false
            throw new Error('SQL reply lost')
          }
          return result
        },
      },
    }))
    let prepared = await w.service.prepareChange(w.context, w.command)
    if (operationName === 'settings.ready') {
      expect(prepared.kind).toBe('unknown')
      prepared = await w.service.prepareChange(w.context, w.command)
    }
    if (prepared.kind !== 'prepared') throw new Error(JSON.stringify(prepared))
    const request = { requestId: 'commit', preparation: prepared.preparation }
    const result = await w.service.commitChange(w.context, request)
    expect(result.kind).toBe(operationName === 'settings.attempt.commit' ? 'unknown' : 'committed')
    expect(await w.service.getOperation(w.context, prepared.preparation.operation)).toMatchObject({
      kind: 'committed',
      revision: 1,
    })
    expect(await w.service.commitChange(w.context, request)).toMatchObject({
      kind: 'committed',
      revision: 1,
    })
    expect(w.requests).toHaveLength(1)
  },
)

it('seals stale basis without silently allocating another preparation', async () => {
  const w = await open()
  const prepared = await w.service.prepareChange(w.context, w.command)
  if (prepared.kind !== 'prepared') throw new Error(JSON.stringify(prepared))
  w.updateCurrent(current => ({ ...current, basis: { ...current.basis, ownerRevision: 2 } }))
  expect(
    await w.service.commitChange(w.context, {
      requestId: 'stale',
      preparation: prepared.preparation,
    }),
  ).toEqual({ kind: 'rejected', reason: 'basis_changed' })
  expect(await w.service.getOperation(w.context, prepared.preparation.operation)).toMatchObject({
    kind: 'pending',
    attempt: null,
  })
  expect(w.requests).toHaveLength(1)
  const next = await w.service.prepareChange(w.context, w.command)
  if (next.kind !== 'prepared') throw new Error(JSON.stringify(next))
  expect(next.preparation.attemptId).not.toBe(prepared.preparation.attemptId)
  expect(w.requests).toHaveLength(2)
})

it('rejects new calls during close and drains an accepted preparation', async () => {
  const entered = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>()
  const w = await open(options => ({
    ...options,
    standing: {
      ...options.standing,
      async reserve(context, request) {
        entered.resolve()
        await release.promise
        return options.standing.reserve(context, request)
      },
    },
  }))
  const accepted = w.service.prepareChange(w.context, w.command)
  await entered.promise
  const closing = w.control.close()
  expect(await w.service.prepareChange(w.context, w.command)).toEqual({
    kind: 'rejected',
    reason: 'closing',
  })
  release.resolve()
  expect((await accepted).kind).toBe('prepared')
  await closing
  expect(
    await w.service.getOperation(w.context, {
      target: w.command.target,
      operationId: w.command.operationId,
    }),
  ).toEqual({ kind: 'rejected', reason: 'closing' })
})

it('concurrent preparation calls share one persisted attempt', async () => {
  const w = await open()
  const results = await Promise.all([
    w.service.prepareChange(w.context, w.command),
    w.service.prepareChange(w.context, w.command),
  ])
  expect(results.some(result => result.kind === 'prepared')).toBe(true)
  const recognized = await w.service.prepareChange(w.context, w.command)
  if (recognized.kind !== 'prepared') throw new Error(JSON.stringify(recognized))
  for (const result of results)
    if (result.kind === 'prepared') expect(result.preparation).toEqual(recognized.preparation)
  expect(new Set(w.requests.map(request => request.binding.operationId)).size).toBe(1)
})

it('keeps a no-change result and performs explicit rebase through the same public preparation path', async () => {
  const w = await open()
  const initial = await w.service.prepareChange(w.context, w.command)
  if (initial.kind !== 'prepared') throw new Error(JSON.stringify(initial))
  expect(
    (
      await w.service.commitChange(w.context, {
        requestId: 'initial',
        preparation: initial.preparation,
      })
    ).kind,
  ).toBe('committed')
  w.updateCurrent(current => ({ ...current, basis: { ...current.basis, valueRevision: 1 } }))
  const repeated = await w.service.prepareChange(w.context, {
    ...w.command,
    operationId: 'same-value',
    expectedRevision: 1,
  })
  if (repeated.kind !== 'prepared') throw new Error(JSON.stringify(repeated))
  expect(
    await w.service.commitChange(w.context, {
      requestId: 'no-change',
      preparation: repeated.preparation,
    }),
  ).toMatchObject({ kind: 'committed', revision: 1, changed: false })
  const next = { ...definition, version: '2' }
  const nextRef = { ...definitionRef, version: '2', digest: digest(next) }
  w.updateDefinition(next)
  w.updateCurrent(current => ({ ...current, basis: { ...current.basis, definitionRef: nextRef } }))
  const prepared = await w.service.prepareRebase(w.context, {
    protocol: 'settings-rebase/1',
    operationId: 'rebase',
    requestId: 'prepare-rebase',
    target: w.command.target,
    from: definitionRef,
    to: nextRef,
    expectedRevision: 1,
    assignments: [{ sourceId: 'tenant', itemId: 'enabled', disposition: 'retain' }],
  })
  if (prepared.kind !== 'prepared') throw new Error(JSON.stringify(prepared))
  const result = await w.service.commitChange(w.context, {
    requestId: 'rebase',
    preparation: prepared.preparation,
  })
  const receipt = await w.world.storage.query(
    intentAttemptIdentity(
      {
        domain: w.options.domain,
        principalRef: w.context.principalRef,
        operation: prepared.preparation.operation,
      },
      prepared.preparation.attemptId,
    ),
  )
  expect(result, JSON.stringify(receipt)).toMatchObject({ kind: 'committed', revision: 2 })
})

it('fails closed before creating a root and does not invent work for a cancel query', async () => {
  const w = await open()
  const operation = { target: w.command.target, operationId: w.command.operationId }
  expect(await w.service.prepareChange({ ...w.context, allowed: false }, w.command)).toEqual({
    kind: 'rejected',
    reason: 'forbidden',
  })
  expect(
    await w.service.cancelChange(w.context, { requestId: 'cancel-missing', operation }),
  ).toEqual({ kind: 'not_found' })
  expect(await w.service.getOperation(w.context, operation)).toEqual({ kind: 'not_found' })
  expect(w.requests).toHaveLength(0)
})

it('seals preparation when current basis changes during external reservation', async () => {
  const entered = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>()
  const w = await open(options => ({
    ...options,
    standing: {
      ...options.standing,
      async reserve(context, request) {
        const held = await options.standing.reserve(context, request)
        entered.resolve()
        await release.promise
        return held
      },
    },
  }))
  const pending = w.service.prepareChange(w.context, w.command)
  await entered.promise
  w.updateCurrent(current => ({ ...current, basis: { ...current.basis, ownerRevision: 9 } }))
  release.resolve()
  expect(await pending).toEqual({ kind: 'rejected', reason: 'basis_changed' })
  expect(
    await w.service.getOperation(w.context, {
      target: w.command.target,
      operationId: w.command.operationId,
    }),
  ).toMatchObject({ kind: 'pending', attempt: null })
  expect(w.requests).toHaveLength(1)
})

it.each([false, true])(
  'seals only a durably rolled-back SQL attempt before explicit reprepare, lost reply = %s',
  async loseReply => {
    let unavailable = true,
      lose = loseReply
    const w = await open(options => ({
      ...options,
      currentCommands(context, input) {
        return input.phase === 'commit' && unavailable
          ? [
              {
                participant: 'fixture.commit-current',
                facts: {
                  current: json({ binding: input.binding, observation: { kind: 'unavailable' } }),
                },
              },
            ]
          : options.currentCommands(context, input)
      },
      storage: {
        ...options.storage,
        async commit(request) {
          const result = await options.storage.commit(request)
          if (
            lose &&
            request.identity.operation === 'settings.attempt.commit' &&
            result.kind === 'rolled_back'
          ) {
            lose = false
            throw new Error('rollback reply lost')
          }
          return result
        },
      },
    }))
    const prepared = await w.service.prepareChange(w.context, w.command)
    if (prepared.kind !== 'prepared') throw new Error(JSON.stringify(prepared))
    const commit = { requestId: 'unavailable', preparation: prepared.preparation }
    const first = await w.service.commitChange(w.context, commit)
    expect(first.kind).toBe(loseReply ? 'unknown' : 'rejected')
    unavailable = false
    if (loseReply)
      expect(await w.service.commitChange(w.context, commit)).toEqual({
        kind: 'rejected',
        reason: 'unavailable',
      })
    expect(await w.service.getOperation(w.context, prepared.preparation.operation)).toMatchObject({
      kind: 'pending',
      attempt: null,
    })
    expect(w.requests).toHaveLength(1)
    const next = await w.service.prepareChange(w.context, w.command)
    if (next.kind !== 'prepared') throw new Error(JSON.stringify(next))
    expect(next.preparation.attemptId).not.toBe(prepared.preparation.attemptId)
    expect(
      await w.service.commitChange(w.context, {
        requestId: 'retry',
        preparation: next.preparation,
      }),
    ).toMatchObject({ kind: 'committed', revision: 1 })
  },
)
