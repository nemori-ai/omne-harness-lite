import { expect, test, vi } from 'vitest'
import { createExecutionContextReader } from '../src/execution-context.ts'
import { originalRecordFixture, recordValue } from './original-record-fixture.ts'
import { at, ref, request, scope } from './execution-owner-fixture.ts'
const origin = request.origin

test('context values are not exposed before the actual durable adoption commit finishes', async () => {
  const f = await originalRecordFixture(),
    entered = Promise.withResolvers<void>(),
    finish = Promise.withResolvers<void>()
  try {
    const source = {
      key: 'workspace',
      revision: 'source-one',
      value: { path: '/first' },
      observedAt: at,
    }
    const context = createExecutionContextReader({
      ref,
      origin,
      journal: f.journal,
      attempts: 2,
      isOpen: () => true,
      reader: { read: async () => ({ kind: 'values', values: [source] }) },
    })
    f.appendIn.mockImplementationOnce(async (...args) => {
      entered.resolve()
      await finish.promise
      return f.log.participant.appendIn(...args)
    })
    let exposed = false
    const read = context.read(['workspace']).then(result => {
      exposed = true
      return result
    })
    await entered.promise
    expect(exposed).toBe(false)
    source.value.path = '/mutated-after-read'
    finish.resolve()
    expect(await read).toEqual({
      kind: 'values',
      values: [{ ...source, value: { path: '/first' } }],
    })
    const history = (await f.read()).executions.get(ref.callId)!
    expect(history.contextReads[0]?.value.values[0]?.value).toEqual({ path: '/first' })
  } finally {
    finish.resolve()
    await f.close()
  }
})

test.each([
  { label: 'missing kind', result: { values: [] } },
  { label: 'extra field', result: { kind: 'values', values: [], extra: true } },
  { label: 'unknown kind', result: { kind: 'other', values: [] } },
  { label: 'non-array values', result: { kind: 'values', values: {} } },
  { label: 'missing requested value', result: { kind: 'values', values: [] } },
  { label: 'non-object value', result: { kind: 'values', values: [null] } },
  {
    label: 'unrequested key',
    result: {
      kind: 'values',
      values: [{ key: 'other', revision: '1', value: 'source', observedAt: at }],
    },
  },
  { label: 'unknown refusal', result: { kind: 'rejected', reason: 'other' } },
  { label: 'non-string refusal', result: { kind: 'rejected', reason: 1 } },
  {
    label: 'uncapturable value',
    result: { kind: 'values', values: [{ key: 'workspace', value: () => undefined }] },
  },
  {
    label: 'invalid adoption record',
    result: {
      kind: 'values',
      values: [{ key: 'workspace', revision: '1', value: 'source', observedAt: 'invalid' }],
    },
  },
])('a malformed source $label cannot produce a durable context adoption', async ({ result }) => {
  const f = await originalRecordFixture()
  try {
    const writes = f.appendIn.mock.calls.length
    const context = createExecutionContextReader({
      ref,
      origin,
      journal: f.journal,
      attempts: 2,
      isOpen: () => true,
      reader: {
        read: async () =>
          result as unknown as import('@omne-harness-lite/runtime-context').ContextRead,
      },
    })
    expect(await context.read(['workspace'])).toEqual({
      kind: 'rejected',
      reason: 'sourceUnavailable',
    })
    expect(f.appendIn).toHaveBeenCalledTimes(writes)
    expect((await f.read()).executions.get(ref.callId)?.contextReads).toHaveLength(0)
  } finally {
    await f.close()
  }
})
test.each([
  'invalidInput',
  'notAuthorized',
  'missingRegistration',
  'viewChanged',
  'sourceUnavailable',
  'ownerStopped',
  'unavailable',
] as const)('the original source refusal %s stays a refusal without adoption', async reason => {
  const f = await originalRecordFixture()
  try {
    const writes = f.appendIn.mock.calls.length
    const context = createExecutionContextReader({
      ref,
      origin,
      journal: f.journal,
      attempts: 2,
      isOpen: () => true,
      reader: { read: async () => ({ kind: 'rejected', reason }) },
    })
    expect(await context.read(['workspace'])).toEqual({ kind: 'rejected', reason })
    expect(f.appendIn).toHaveBeenCalledTimes(writes)
    expect((await f.read()).executions.get(ref.callId)?.contextReads).toHaveLength(0)
  } finally {
    await f.close()
  }
})
test('an empty context request confirms the actual empty value set', async () => {
  const f = await originalRecordFixture()
  try {
    const context = createExecutionContextReader({
      ref,
      origin,
      journal: f.journal,
      attempts: 2,
      isOpen: () => true,
      reader: { read: async () => ({ kind: 'values', values: [] }) },
    })
    expect(await context.read([])).toEqual({ kind: 'values', values: [] })
    expect((await f.read()).executions.get(ref.callId)?.contextReads[0]?.value.values).toEqual([])
  } finally {
    await f.close()
  }
})
test('an asynchronous adoption failure is caught without exposing unconfirmed values', async () => {
  const f = await originalRecordFixture()
  try {
    const context = createExecutionContextReader({
      ref,
      origin,
      journal: {
        ...f.journal,
        commit: async () => {
          throw new Error('original adoption failed')
        },
      },
      attempts: 2,
      isOpen: () => true,
      reader: {
        read: async () => ({
          kind: 'values',
          values: [{ key: 'workspace', revision: '1', value: 'source', observedAt: at }],
        }),
      },
    })
    expect(await context.read(['workspace'])).toEqual({ kind: 'rejected', reason: 'unavailable' })
    expect((await f.read()).executions.get(ref.callId)?.contextReads).toHaveLength(0)
  } finally {
    await f.close()
  }
})
test('serialized context reads retain both actual revisions instead of replaying the first adopted value', async () => {
  const f = await originalRecordFixture()
  try {
    let revision = 0
    const context = createExecutionContextReader({
      ref,
      origin,
      journal: f.journal,
      attempts: 2,
      isOpen: () => true,
      reader: {
        read: async () => ({
          kind: 'values',
          values: [
            { key: 'workspace', revision: String(++revision), value: revision, observedAt: at },
          ],
        }),
      },
    })
    const reads = await Promise.all([context.read(['workspace']), context.read(['workspace'])])
    expect(
      reads.map(result => (result.kind === 'values' ? result.values[0]?.value : result.reason)),
    ).toEqual([1, 2])
    expect(
      (await f.read()).executions
        .get(ref.callId)
        ?.contextReads.map(read => read.value.values[0]?.value),
    ).toEqual([1, 2])
  } finally {
    await f.close()
  }
})

test('a completed execution cannot adopt a later context value', async () => {
  const f = await originalRecordFixture()
  try {
    await f.journal.commit({
      ...(await f.commitInput()),
      values: [
        recordValue({
          revision: 1,
          ref,
          kind: 'execution_ended',
          terminal: { outcome: 'unavailable', reason: 'implementation_withdrawn' },
          account: {
            callId: ref.callId,
            initiator: scope.tenant,
            externalEffect: 'unknown',
            cost: { total_usd: 0, items: [] },
            frames: 'unknown',
            wallClock: { startedAt: at, endedAt: at },
          },
          delivery: {
            result: {
              id: 'result',
              kind: 'tool_result',
              callId: ref.callId,
              outcome: 'unavailable',
              visibility: { toHuman: true, toModel: true },
              blocks: [],
            },
            pass: 'after',
            selectedChain: [],
          },
        }),
      ],
    })
    const context = createExecutionContextReader({
      ref,
      origin,
      journal: f.journal,
      attempts: 2,
      isOpen: () => true,
      reader: {
        read: async () => ({
          kind: 'values',
          values: [{ key: 'workspace', revision: 'one', value: null, observedAt: at }],
        }),
      },
    })
    expect(await context.read(['workspace'])).toEqual({ kind: 'rejected', reason: 'ownerStopped' })
    expect(f.appendIn).toHaveBeenCalledTimes(1)
  } finally {
    await f.close()
  }
})

test('context key errors and source refusal never create successful adoption facts', async () => {
  const f = await originalRecordFixture()
  try {
    const read = vi.fn(async () => ({
      kind: 'rejected' as const,
      reason: 'notAuthorized' as const,
    }))
    const context = createExecutionContextReader({
      ref,
      origin,
      journal: f.journal,
      attempts: 2,
      isOpen: () => true,
      reader: { read },
    })
    expect(await context.read(['workspace', 'workspace'])).toEqual({
      kind: 'rejected',
      reason: 'invalidInput',
    })
    expect(read).not.toHaveBeenCalled()
    expect(await context.read(['workspace'])).toEqual({ kind: 'rejected', reason: 'notAuthorized' })
    expect((await f.read()).executions.get(ref.callId)?.contextReads).toHaveLength(0)
    expect(f.appendIn).toHaveBeenCalledTimes(0)
  } finally {
    await f.close()
  }
})

test('a lost context commit return keeps the original values and never returns them as a later read', async () => {
  const f = await originalRecordFixture()
  const loss = f.loseNextCommit('execution_context_read')
  let revision = 0
  try {
    const context = createExecutionContextReader({
      ref,
      origin,
      journal: f.journal,
      attempts: 2,
      isOpen: f.journal.isCurrent,
      reader: {
        read: async () => ({
          kind: 'values',
          values: [
            { key: 'workspace', revision: String(++revision), value: revision, observedAt: at },
          ],
        }),
      },
    })
    expect(await context.read(['workspace'])).toEqual({ kind: 'rejected', reason: 'unavailable' })
    expect(loss.matched()).toBe(true)
    expect(await context.read(['workspace'])).toMatchObject({
      kind: 'values',
      values: [{ value: 2 }],
    })
    expect(
      (await f.read()).executions
        .get(ref.callId)
        ?.contextReads.map(item => item.value.values[0]?.value),
    ).toEqual([1, 2])
    expect(f.appendIn).toHaveBeenCalledTimes(2)
  } finally {
    loss.restore()
    await f.close()
  }
})
