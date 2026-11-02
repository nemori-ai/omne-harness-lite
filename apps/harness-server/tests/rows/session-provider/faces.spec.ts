// The Session faces of the `session-provider` contract double, called through the `session`
// service key by caller class. The double keeps sessions in process memory only.
import type { SessionFailure } from '@omne-harness/session-contract'
import {
  creation,
  operationId,
  ordinaryInput,
  sessionId,
} from '@omne-harness/session-contract/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { TENANT_A, loadProviderTree, type ProviderTree } from './support.ts'

let tree: ProviderTree | undefined
afterEach(async () => {
  await tree?.dispose()
  tree = undefined
})

async function open(): Promise<ProviderTree> {
  tree = await loadProviderTree()
  return tree
}

function failureOf(result: unknown): SessionFailure {
  if (typeof result !== 'object' || result === null || !('failure' in result))
    throw new Error(`expected a failure, got ${JSON.stringify(result)}`)
  return result.failure as SessionFailure
}

function okOf<T>(result: { ok: T } | { failure: SessionFailure }): T {
  if (!('ok' in result)) throw new Error(`expected success, got ${JSON.stringify(result)}`)
  return result.ok
}

async function createSession(t: ProviderTree, session = 'sess-1', operation = 'create-1') {
  const principal = t.principalFor(TENANT_A)
  return t.intake.management.create({
    principal,
    tenant: TENANT_A,
    session: sessionId(session),
    operation: operationId(operation),
    creation: creation(),
  })
}

async function accept(t: ProviderTree, input: string, text: string, operation: string) {
  return t.intake.work.accept({
    principal: t.principalFor(TENANT_A),
    tenant: TENANT_A,
    session: sessionId('sess-1'),
    operation: operationId(operation),
    value: ordinaryInput(input, text),
  })
}

async function readAll(t: ProviderTree, kinds: readonly string[] = ['message.user']) {
  return t.reader.history.begin({
    principal: t.principalFor(TENANT_A),
    tenant: TENANT_A,
    session: sessionId('sess-1'),
    kinds,
    from: null,
    direction: 'forward',
    pageBytes: 65536,
  })
}

describe('session-provider faces: management.create', () => {
  it('registers the session and answers a receipt with a snapshot of the new session', async () => {
    const t = await open()
    const created = okOf(await createSession(t))
    expect(created.receipt.operation).toBe(operationId('create-1'))
    expect(created.receipt.recovered).toBe(false)
    expect(created.state.session).toBe(sessionId('sess-1'))
    expect(created.state.lifecycle).toBe('dormant')
  })

  it('answers the same receipt when the same operation is replayed', async () => {
    const t = await open()
    const first = okOf(await createSession(t))
    const replay = okOf(await createSession(t))
    expect(replay.receipt).toEqual({ ...first.receipt, recovered: true })
  })

  it('answers conflict when the same operation arrives with another creation', async () => {
    const t = await open()
    await createSession(t)
    const changed = await t.intake.management.create({
      principal: t.principalFor(TENANT_A),
      tenant: TENANT_A,
      session: sessionId('sess-1'),
      operation: operationId('create-1'),
      creation: creation({ purpose: 'another purpose' }),
    })
    expect(failureOf(changed)).toEqual({ kind: 'conflict', operation: operationId('create-1') })
  })

  it('refuses a second operation on a session that exists, and keeps the first state', async () => {
    const t = await open()
    await createSession(t)
    const second = await createSession(t, 'sess-1', 'create-2')
    expect(failureOf(second).kind).toBe('invalid')
    expect(okOf(await createSession(t)).receipt.recovered).toBe(true)
  })
})

describe('session-provider faces: work.accept and work.queryOperation', () => {
  it('appends the input once and answers the same receipt when the operation is replayed', async () => {
    const t = await open()
    await createSession(t)
    const first = okOf(await accept(t, 'input-1', 'hello', 'accept-1'))
    const replay = okOf(await accept(t, 'input-1', 'hello', 'accept-1'))
    expect(first.recovered).toBe(false)
    expect(replay).toEqual({ ...first, recovered: true })
    const page = okOf(await readAll(t))
    expect(page.entries).toHaveLength(1)
  })

  it('answers conflict when one operation arrives with another input', async () => {
    const t = await open()
    await createSession(t)
    await accept(t, 'input-1', 'hello', 'accept-1')
    const other = await accept(t, 'input-2', 'something else', 'accept-1')
    expect(failureOf(other)).toEqual({ kind: 'conflict', operation: operationId('accept-1') })
    expect(okOf(await readAll(t)).entries).toHaveLength(1)
  })

  it('refuses one input identity under a second operation, and appends nothing', async () => {
    const t = await open()
    await createSession(t)
    await accept(t, 'input-1', 'hello', 'accept-1')
    const again = await accept(t, 'input-1', 'hello', 'accept-2')
    expect(failureOf(again)).toMatchObject({ kind: 'invalid', field: 'input' })
    expect(okOf(await readAll(t)).entries).toHaveLength(1)
  })

  it('does not accept an input into a session that was never registered', async () => {
    const t = await open()
    const result = await accept(t, 'input-1', 'hello', 'accept-1')
    expect(failureOf(result)).toEqual({ kind: 'denied', action: 'work.accept' })
  })

  it('answers the known outcome of an operation, and unknown for an operation it never saw', async () => {
    const t = await open()
    const created = okOf(await createSession(t))
    const accepted = okOf(await accept(t, 'input-1', 'hello', 'accept-1'))
    const query = (operation: string) =>
      t.intake.work.queryOperation({
        principal: t.principalFor(TENANT_A),
        tenant: TENANT_A,
        session: sessionId('sess-1'),
        operation: operationId(operation),
      })
    expect(okOf(await query('create-1'))).toEqual({
      kind: 'committed',
      receipt: created.receipt,
    })
    expect(okOf(await query('accept-1'))).toEqual({ kind: 'committed', receipt: accepted })
    expect(okOf(await query('never-seen'))).toEqual({ kind: 'unknown' })
  })
})

describe('session-provider faces: history', () => {
  it('gives the accepted inputs in order, and pages them by bytes with a cursor', async () => {
    const t = await open()
    await createSession(t)
    await accept(t, 'input-1', 'first', 'accept-1')
    await accept(t, 'input-2', 'second', 'accept-2')
    const whole = okOf(await readAll(t))
    expect(whole.entries.map(entry => entry.kind)).toEqual(['message.user', 'message.user'])
    expect(whole.exhausted).toBe(true)
    expect(whole.next).toBeNull()
    expect(JSON.stringify(whole.entries[0]?.payload)).toContain('first')
    expect(JSON.stringify(whole.entries[1]?.payload)).toContain('second')

    const small = okOf(
      await t.reader.history.begin({
        principal: t.principalFor(TENANT_A),
        tenant: TENANT_A,
        session: sessionId('sess-1'),
        kinds: ['message.user'],
        from: null,
        direction: 'forward',
        pageBytes: 1,
      }),
    )
    expect(small.entries).toHaveLength(1)
    expect(small.exhausted).toBe(false)
    expect(small.next).not.toBeNull()
    const rest = okOf(
      await t.reader.history.next({
        principal: t.principalFor(TENANT_A),
        tenant: TENANT_A,
        session: sessionId('sess-1'),
        cursor: small.next ?? '',
      }),
    )
    expect(rest.entries.map(entry => entry.id)).toEqual([whole.entries[1]?.id])
    expect(rest.exhausted).toBe(true)
  })

  it('reads backward from the newest entry, and filters by kind', async () => {
    const t = await open()
    await createSession(t)
    await accept(t, 'input-1', 'first', 'accept-1')
    await accept(t, 'input-2', 'second', 'accept-2')
    const backward = okOf(
      await t.reader.history.begin({
        principal: t.principalFor(TENANT_A),
        tenant: TENANT_A,
        session: sessionId('sess-1'),
        kinds: ['message.user'],
        from: null,
        direction: 'backward',
        pageBytes: 65536,
      }),
    )
    expect(JSON.stringify(backward.entries[0]?.payload)).toContain('second')
    expect(okOf(await readAll(t, ['message.assistant'])).entries).toEqual([])
  })

  it('answers invalid for a cursor that it never issued', async () => {
    const t = await open()
    await createSession(t)
    const forged = await t.reader.history.next({
      principal: t.principalFor(TENANT_A),
      tenant: TENANT_A,
      session: sessionId('sess-1'),
      cursor: 'forged-cursor',
    })
    expect(failureOf(forged).kind).toBe('invalid')
  })

  it('does not follow the cursor of one session into another session', async () => {
    const t = await open()
    await createSession(t)
    await createSession(t, 'sess-2', 'create-2')
    await accept(t, 'input-1', 'first', 'accept-1')
    await accept(t, 'input-2', 'second', 'accept-2')
    const page = okOf(
      await t.reader.history.begin({
        principal: t.principalFor(TENANT_A),
        tenant: TENANT_A,
        session: sessionId('sess-1'),
        kinds: ['message.user'],
        from: null,
        direction: 'forward',
        pageBytes: 1,
      }),
    )
    const other = await t.reader.history.next({
      principal: t.principalFor(TENANT_A),
      tenant: TENANT_A,
      session: sessionId('sess-2'),
      cursor: page.next ?? '',
    })
    expect(failureOf(other).kind).toBe('invalid')
  })
})

describe('session-provider faces: controls', () => {
  it('answers not-found for a run, because the session never had one, and replays the answer', async () => {
    const t = await open()
    await createSession(t)
    const cancel = () =>
      t.intake.work.cancelRun({
        principal: t.principalFor(TENANT_A),
        tenant: TENANT_A,
        session: sessionId('sess-1'),
        operation: operationId('cancel-1'),
        run: 'run-1' as never,
        urgency: 'graceful',
      })
    const first = okOf(await cancel())
    expect(first.answer).toEqual({ kind: 'not-found' })
    expect(okOf(await cancel())).toEqual(first)
  })

  it('answers not-found for a model call and unsupported for a tool call', async () => {
    const t = await open()
    await createSession(t)
    const stop = (operation: string, producer: { kind: 'model' | 'tool'; call: string }) =>
      t.intake.work.stopCall({
        principal: t.principalFor(TENANT_A),
        tenant: TENANT_A,
        session: sessionId('sess-1'),
        operation: operationId(operation),
        producer,
      })
    expect(okOf(await stop('stop-1', { kind: 'model', call: 'call-1' })).answer).toEqual({
      kind: 'not-found',
    })
    expect(failureOf(await stop('stop-2', { kind: 'tool', call: 'call-1' }))).toEqual({
      kind: 'unsupported',
    })
  })

  it('answers invalid for an empty run identity and writes no operation record', async () => {
    const t = await open()
    await createSession(t)
    const result = await t.intake.work.cancelRun({
      principal: t.principalFor(TENANT_A),
      tenant: TENANT_A,
      session: sessionId('sess-1'),
      operation: operationId('cancel-1'),
      run: '' as never,
      urgency: 'graceful',
    })
    expect(failureOf(result)).toMatchObject({ kind: 'invalid', field: 'run' })
    const query = await t.intake.work.queryOperation({
      principal: t.principalFor(TENANT_A),
      tenant: TENANT_A,
      session: sessionId('sess-1'),
      operation: operationId('cancel-1'),
    })
    expect(okOf(query)).toEqual({ kind: 'unknown' })
  })
})

describe('session-provider faces: operations outside the double', () => {
  it('answers unavailable from its own owner, and does not throw', async () => {
    const t = await open()
    await createSession(t)
    const result = await t.intake.work.readWork({
      principal: t.principalFor(TENANT_A),
      tenant: TENANT_A,
      session: sessionId('sess-1'),
    })
    expect(failureOf(result)).toMatchObject({ kind: 'unavailable', owner: 'session-provider' })
    const reconcile = await t.intake.reconciliation.pending({
      principal: t.principalFor(TENANT_A),
      tenant: TENANT_A,
      after: null,
      limit: 10,
    })
    expect(failureOf(reconcile)).toMatchObject({ kind: 'unavailable', owner: 'session-provider' })
  })
})
