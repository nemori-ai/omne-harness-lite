import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, vi } from 'vitest'
import { LosslessNumber } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import { compareInteger, type AppendRequest, type SessionLog } from '@omne-harness-lite/session-log'
import { openJsonlSessionLog } from '@omne-harness-lite/session-log-jsonl'
import type { ToolActionHistoryOperations } from '@omne-harness-lite/tool-admission'
import {
  captureToolJournalValue,
  type ToolJournalPayload,
} from '@omne-harness-lite/tool-execution-runtime'
import { createRuntimeJournal } from '../src/runtime-journal.ts'
import { createExecutionContextReader } from '../src/execution-context.ts'

const scope = {
  tenant: unwrap(parseTenantId({ organization: 'journal-org', account: 'journal-user' })),
  session: unwrap(parseOpaqueIdentifier('journal-session', 'SessionRef')),
}
const ref = { ...scope, callId: unwrap(parseOpaqueIdentifier('call', 'CallId')) },
  origin = { run: 'run', attempt: 1, assistantMessage: 'model-reply' }
const at = '2026-10-04T00:00:00Z'
function value(input: unknown): ToolJournalPayload {
  const result = captureToolJournalValue(input)
  if ('invalid' in result) throw new Error('invalid journal fixture')
  return result
}
const intent = value({
  kind: 'execution_intended',
  revision: 1,
  ref,
  origin,
  input: { parameter: 1 },
  selected: {
    capability: 'tool:echo',
    asset: 'echo-asset',
    version: '1',
    adoption: 'adopted',
    definition: {
      name: 'echo',
      description: 'Echo',
      paradigm: 'single',
      origin: { kind: 'authored' },
      input: { type: 'object', properties: {}, description: 'Input' },
      permissions: { execute: { default: 'auto' } },
    },
  },
})
const started = value({ kind: 'execution_started', revision: 1, ref, at })

/** Real atomic JSONL; the application history port is controlled. These tests do not establish D1 admission. */
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'omne-runtime-journal-'))
  const log = await openJsonlSessionLog({
    dir,
    processOwnership: { current: 'journal-test', observeExit: async () => 'exited' },
  })
  let generation = 'first-owner'
  const append = vi.fn<SessionLog['append']>(log.append),
    readSince = vi.fn(log.readSince),
    release = vi.fn(async () => {})
  const history = {
    inspect: vi.fn<ToolActionHistoryOperations['inspect']>(prefix =>
      compareInteger(prefix.tail, prefix.entries.length) === 0 &&
      prefix.entries.every((entry, i) => compareInteger(entry.position, i + 1) === 0)
        ? { kind: 'notFound' }
        : { kind: 'unavailable' },
    ),
  }
  const journal = createRuntimeJournal({
    history,
    backing: {
      get ownerGeneration() {
        return generation
      },
      borrow: () => ({ log: { append, readSince, readByKey: log.readByKey }, release }),
    },
  })
  async function read() {
    const result = await journal.read(scope, ref.callId)
    if (result.kind !== 'view') throw new Error(`journal fixture ${result.reason}`)
    return result
  }
  const submit = async (
    values: readonly ToolJournalPayload[],
    expected?: { ownerGeneration: string; tail: number },
  ) => journal.commit({ ref, origin, expected: expected ?? (await read()).prefix, values })
  return {
    journal,
    log,
    append,
    readSince,
    release,
    history,
    submit,
    read,
    replaceOwner() {
      generation = 'second-owner'
    },
    async close() {
      await journal.close()
      await log.close()
      await rm(dir, { recursive: true, force: true })
    },
  }
}

test('uses one whole original same-tail batch and recognizes equivalent numerical input without duplicating facts', async () => {
  const f = await fixture()
  try {
    expect(await f.submit([intent, started])).toHaveProperty('kind', 'view')
    expect(f.append.mock.calls[0]?.[1]).toHaveLength(2)
    expect(f.append.mock.calls[0]?.[2]).toEqual({ kind: 'unfenced' })
    expect(f.append.mock.calls[0]?.[3]).toEqual({ kind: 'tailEquals', tail: 0 })
    const equivalent = value({ ...intent, input: { parameter: new LosslessNumber('1.0') } })
    expect(
      await f.submit([equivalent, started], { ownerGeneration: 'first-owner', tail: 0 }),
    ).toHaveProperty('kind', 'view')
    expect(f.append).toHaveBeenCalledTimes(1)
    expect(await f.submit([value({ ...intent, input: { parameter: 2 } })])).toEqual({
      kind: 'rejected',
      reason: 'conflict',
    })
  } finally {
    await f.close()
  }
})
test('a stale checked tail is rejected rather than silently replaced with the new read tail', async () => {
  const f = await fixture()
  try {
    await f.submit([intent])
    expect(await f.submit([started], { ownerGeneration: 'first-owner', tail: 0 })).toEqual({
      kind: 'rejected',
      reason: 'tailChanged',
    })
    expect(f.append).toHaveBeenCalledTimes(1)
    expect(await f.submit([started])).toHaveProperty('kind', 'view')
  } finally {
    await f.close()
  }
})
test('captures an expected generation before IO and fails when the physical owner changes', async () => {
  const f = await fixture()
  try {
    f.readSince.mockImplementationOnce(async (...args) => {
      const result = await f.log.readSince(...args)
      f.replaceOwner()
      return result
    })
    expect(
      await f.journal.commit({
        ref,
        origin,
        expected: { ownerGeneration: 'first-owner', tail: 0 },
        values: [intent],
      }),
    ).toEqual({ kind: 'rejected', reason: 'unavailable' })
    expect(f.append).not.toHaveBeenCalled()
  } finally {
    await f.close()
  }
})
test.each(['lost receipt', 'throw'] as const)(
  'recognizes %s without a second append',
  async mode => {
    const f = await fixture()
    try {
      f.append.mockImplementationOnce(async (...args) => {
        await f.log.append(...args)
        if (mode === 'throw') throw new Error('lost')
        return { failure: 'unavailable' }
      })
      expect(await f.submit([intent, started])).toEqual({ kind: 'rejected', reason: 'unavailable' })
      expect(await f.submit([intent, started])).toHaveProperty('kind', 'view')
      expect(f.append).toHaveBeenCalledTimes(1)
    } finally {
      await f.close()
    }
  },
)
test('an absent unknown write blocks a later different decision and prevents release', async () => {
  const f = await fixture()
  let unknown: AppendRequest | undefined
  try {
    f.append.mockImplementationOnce(async (session, entries, fence, condition) => {
      unknown = { session, entries: entries as AppendRequest['entries'], fence, condition }
      return { failure: 'unavailable' }
    })
    expect(await f.submit([intent])).toEqual({ kind: 'rejected', reason: 'unavailable' })
    expect(
      await f.journal.commit({
        ref,
        origin,
        expected: { ownerGeneration: 'first-owner', tail: 0 },
        values: [started],
      }),
    ).toEqual({ kind: 'rejected', reason: 'unavailable' })
    await expect(f.journal.close()).rejects.toThrow('unresolved writes')
    expect(f.release).not.toHaveBeenCalled()
    if (!unknown) throw new Error('missing captured append')
    expect(
      await f.log.append(unknown.session, unknown.entries, unknown.fence, unknown.condition),
    ).not.toHaveProperty('failure')
    await f.journal.close()
    expect(f.release).toHaveBeenCalledTimes(1)
  } finally {
    await f.close()
  }
})
test('a corrupt common prefix or impossible tool transition cannot be appended', async () => {
  const f = await fixture()
  try {
    expect(await f.submit([started])).toEqual({ kind: 'rejected', reason: 'conflict' })
    f.history.inspect.mockReturnValue({ kind: 'unavailable' })
    expect(
      await f.journal.commit({
        ref,
        origin,
        expected: { ownerGeneration: 'first-owner', tail: 0 },
        values: [intent],
      }),
    ).toEqual({ kind: 'rejected', reason: 'unavailable' })
    expect(f.append).not.toHaveBeenCalled()
  } finally {
    await f.close()
  }
})
test('close drains admitted work but no longer admits new reads or commits', async () => {
  const f = await fixture(),
    entered = Promise.withResolvers<void>(),
    finish = Promise.withResolvers<void>()
  try {
    f.append.mockImplementationOnce(async (...args) => {
      entered.resolve()
      await finish.promise
      return f.log.append(...args)
    })
    const work = f.submit([intent])
    await entered.promise
    const closing = f.journal.close()
    expect(await f.journal.read(scope, ref.callId)).toEqual({
      kind: 'rejected',
      reason: 'unavailable',
    })
    expect(f.release).not.toHaveBeenCalled()
    finish.resolve()
    expect(await work).toHaveProperty('kind', 'view')
    await closing
    expect(f.release).toHaveBeenCalledTimes(1)
  } finally {
    finish.resolve()
    await f.close()
  }
})

test('context values are not exposed before the actual durable adoption commit finishes', async () => {
  const f = await fixture(),
    entered = Promise.withResolvers<void>(),
    finish = Promise.withResolvers<void>()
  try {
    await f.submit([intent, started])
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
    f.append.mockImplementationOnce(async (...args) => {
      entered.resolve()
      await finish.promise
      return f.log.append(...args)
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

test('serialized context reads retain both actual revisions instead of replaying the first adopted value', async () => {
  const f = await fixture()
  try {
    await f.submit([intent, started])
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

test('an unknown context append does not return the unconfirmed source values or replace its decision', async () => {
  const f = await fixture()
  let unknown: AppendRequest | undefined
  try {
    await f.submit([intent, started])
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
    f.append.mockImplementationOnce(async (session, entries, fence, condition) => {
      unknown = { session, entries: entries as AppendRequest['entries'], fence, condition }
      return { failure: 'unavailable' }
    })
    expect(await context.read(['workspace'])).toEqual({ kind: 'rejected', reason: 'unavailable' })
    expect(await context.read(['workspace'])).toEqual({ kind: 'rejected', reason: 'unavailable' })
    expect(f.append).toHaveBeenCalledTimes(2) // intent/start, original context read only
    if (!unknown) throw new Error('missing unknown context append')
    await f.log.append(unknown.session, unknown.entries, unknown.fence, unknown.condition)
    expect(await context.read(['workspace'])).toMatchObject({
      kind: 'values',
      values: [{ value: 3 }],
    })
    expect(
      (await f.read()).executions
        .get(ref.callId)
        ?.contextReads.map(read => read.value.values[0]?.value),
    ).toEqual([1, 3])
  } finally {
    if (unknown)
      await f.log.append(unknown.session, unknown.entries, unknown.fence, unknown.condition)
    await f.close()
  }
})

test('a completed execution cannot adopt a later context value', async () => {
  const f = await fixture()
  try {
    await f.submit([intent])
    await f.submit([
      value({
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
    ])
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
    expect(f.append).toHaveBeenCalledTimes(2)
  } finally {
    await f.close()
  }
})

test('context key errors and source refusal never create successful adoption facts', async () => {
  const f = await fixture()
  try {
    await f.submit([intent])
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
    expect(f.append).toHaveBeenCalledTimes(1)
  } finally {
    await f.close()
  }
})
