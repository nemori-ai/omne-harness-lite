// The narrow read of the session binding source (D-AUTH r4 4.1): the ownership of a session and
// the evidence that established it never change, so the read asks the journal row and the first
// batch through `session.binding` and never the work snapshot, keeps a `bound` answer in the
// process, and keeps nothing else. Each case counts the handler reads that the storage served.
import { describe, expect, it } from 'vitest'
import { sessionId } from '@omne-harness/session-contract/testing'
import {
  BINDING_HANDLER,
  createBindingMemo,
  createSessionPrincipalBindings,
} from '../src/bindings.ts'
import { app, TENANT_A, TENANT_B, type App } from './fixtures/app.ts'
import { kindOf } from './fixtures/entries.ts'

const SESSION = sessionId('session-1')

const readsOf = (a: App, handler: string): number =>
  a.provider.calls.filter(call => call.kind === 'read' && call.handler === handler).length

async function established() {
  const a = await app()
  expect(kindOf(await a.create(TENANT_A))).toBeUndefined()
  return a
}

const boundOf = (answer: Awaited<ReturnType<App['bindings']['read']>>) => {
  if (!('ok' in answer) || answer.ok.kind !== 'bound')
    throw new Error(`not bound: ${JSON.stringify(answer)}`)
  return answer.ok
}

describe('the binding read does not read the work snapshot', () => {
  it('asks only its own handler: no `session.work`, no version read, and no SQL on the state row', async () => {
    const a = await established()
    const sqlBefore = a.provider.readSql.length
    boundOf(await a.bindings.read({ tenant: TENANT_A, session: SESSION }))
    expect(readsOf(a, 'session.work')).toBe(0)
    expect(readsOf(a, 'session.work-version')).toBe(0)
    expect(readsOf(a, BINDING_HANDLER)).toBe(1)
    expect(a.provider.readSql.slice(sqlBefore).filter(sql => /sl_state/.test(sql))).toEqual([])
  })

  it('answers while the snapshot row is not there to read: the answer does not depend on the row', async () => {
    const a = await established()
    a.provider.seed('dom_0', 'DELETE FROM sl_state')
    expect(boundOf(await a.bindings.read({ tenant: TENANT_A, session: SESSION }))).toMatchObject({
      session: SESSION,
    })
  })
})

describe('a bound answer is kept', () => {
  it('reads the storage once for any number of reads of one session', async () => {
    const a = await established()
    const first = boundOf(await a.bindings.read({ tenant: TENANT_A, session: SESSION }))
    for (let at = 0; at < 5; at += 1)
      expect(boundOf(await a.bindings.read({ tenant: TENANT_A, session: SESSION }))).toEqual(first)
    expect(readsOf(a, BINDING_HANDLER)).toBe(1)
  })

  it('does not hand the kept answer of tenant A to tenant B for the same session name', async () => {
    const a = await established()
    boundOf(await a.bindings.read({ tenant: TENANT_A, session: SESSION }))
    expect(await a.bindings.read({ tenant: TENANT_B, session: SESSION })).toEqual({
      ok: { kind: 'not-bound' },
    })
  })

  it('keeps the establishing evidence when later batches commit, and a source with no memory derives the same', async () => {
    const a = await established()
    const first = boundOf(await a.bindings.read({ tenant: TENANT_A, session: SESSION }))
    expect(kindOf(await a.accept(TENANT_A, 'session-1', 'later'))).toBeUndefined()
    const work = await a.port.readWork(a.access(TENANT_A))
    if (!('ok' in work)) throw new Error('readWork failed')
    // The snapshot moved to the evidence of the later batch; the binding did not.
    expect(work.ok.source).not.toEqual(first.source)
    expect(boundOf(await a.bindings.read({ tenant: TENANT_A, session: SESSION })).source).toEqual(
      first.source,
    )
    const fresh = createSessionPrincipalBindings({
      storage: a.provider.storage,
      domains: a.storageOptions.domains,
    })
    expect(boundOf(await fresh.read({ tenant: TENANT_A, session: SESSION })).source).toEqual(
      first.source,
    )
  })

  it('keeps at most its bound of sessions and drops the oldest first', () => {
    const memo = createBindingMemo(2)
    const answer = { kind: 'bound' } as never
    memo.set('a', answer)
    memo.set('b', answer)
    memo.set('c', answer)
    expect([memo.get('a'), memo.get('b'), memo.get('c')]).toEqual([undefined, answer, answer])
    expect(memo.size).toBe(2)
  })
})

describe('only a bound answer is kept', () => {
  it('a session that is not there yet is not-bound once and bound after it is created', async () => {
    const a = await app()
    expect(await a.bindings.read({ tenant: TENANT_A, session: SESSION })).toEqual({
      ok: { kind: 'not-bound' },
    })
    expect(kindOf(await a.create(TENANT_A))).toBeUndefined()
    expect(boundOf(await a.bindings.read({ tenant: TENANT_A, session: SESSION }))).toMatchObject({
      session: SESSION,
      source: { owner: expect.any(String), record: expect.any(String) },
    })
  })

  it('a read that failed is read again, not kept as unavailable', async () => {
    const a = await established()
    a.provider.failReads(BINDING_HANDLER)
    expect(kindOf(await a.bindings.read({ tenant: TENANT_A, session: SESSION }))).toBe(
      'unavailable',
    )
    a.provider.failReads(null)
    boundOf(await a.bindings.read({ tenant: TENANT_A, session: SESSION }))
  })
})

describe('after stop', () => {
  it('every read is unavailable and says the storage is closing, the kept answers too, and nothing reads the storage', async () => {
    const a = await established()
    boundOf(await a.bindings.read({ tenant: TENANT_A, session: SESSION }))
    const reads = readsOf(a, BINDING_HANDLER)
    a.bindings.stop()
    expect(await a.bindings.read({ tenant: TENANT_A, session: SESSION })).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: expect.stringContaining('closing') },
    })
    expect(await a.bindings.read({ tenant: TENANT_A, session: sessionId('other') })).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: expect.stringContaining('closing') },
    })
    expect(readsOf(a, BINDING_HANDLER)).toBe(reads)
  })
})
