import { describe, expect, it } from 'vitest'
import type { Relation, SessionCommand, SessionCreation } from '@omne-harness/session-contract'
import { evidence, operationId, sessionId } from '@omne-harness/session-contract/testing'
import { app, TENANT_A, TENANT_B, textOf, type App } from './fixtures/app.ts'

const basis = evidence('dispatch')
const childOf = (parent: string): Pick<SessionCreation, 'relation' | 'attendance'> => ({
  relation: { kind: 'child', parent: sessionId(parent), basis } satisfies Relation,
  attendance: 'unattended',
})

const work = async (a: App, session: string, tenant = TENANT_A) => {
  const read = await a.port.readWork(a.access(tenant, session))
  if (!('ok' in read)) throw new Error(JSON.stringify(read))
  return read.ok
}

const recorded = (a: App, session: string): number =>
  a.provider.select(
    'dom_0',
    "SELECT position FROM sl_entry WHERE tenant = ? AND session = ? AND kind = 'session.child-recorded'",
    [textOf(TENANT_A), session],
  ).rows.length

const journal = (a: App, session: string) => {
  const found = a.provider.select(
    'dom_0',
    'SELECT commit_seq, epoch FROM sl_journal WHERE tenant = ? AND session = ?',
    [textOf(TENANT_A), session],
  ).rows[0]
  return { seq: BigInt(found?.[0] as bigint), epoch: found?.[1] }
}

const journals = (a: App, domain = 'dom_0'): number =>
  a.provider.select(domain, 'SELECT session FROM sl_journal', []).rows.length

describe('a child session and its record in the parent are one storage commit (SW-I23)', () => {
  it('writes the child and the entry of the parent in one commit, and the parent reads it at once', async () => {
    const a = await app()
    await a.create(TENANT_A)
    const before = await work(a, 'session-1')
    const was = journal(a, 'session-1')
    const created = await a.create(TENANT_A, 'child-1', childOf('session-1'))
    expect('ok' in created).toBe(true)
    expect(journal(a, 'session-1')).toEqual({ seq: was.seq + 1n, epoch: was.epoch })
    const child = await work(a, 'child-1')
    expect(child.relation).toEqual({ kind: 'child', parent: sessionId('session-1'), basis })
    expect(child.tree).toEqual({ root: sessionId('session-1'), depth: 1 })
    expect(child.attendance).toBe('unattended')
    const parent = await work(a, 'session-1')
    expect(parent.children).toEqual([sessionId('child-1')])
    expect(BigInt(parent.revision)).toBe(BigInt(before.revision) + 1n)
    expect(recorded(a, 'session-1')).toBe(1)
  })

  it('records every child of one parent, each under an operation of its own', async () => {
    const a = await app()
    await a.create(TENANT_A)
    await a.create(TENANT_A, 'child-1', childOf('session-1'))
    expect('ok' in (await a.create(TENANT_A, 'child-2', childOf('session-1')))).toBe(true)
    expect((await work(a, 'session-1')).children).toEqual([
      sessionId('child-1'),
      sessionId('child-2'),
    ])
    expect(recorded(a, 'session-1')).toBe(2)
  })

  it('recalls the same child for the same request and records it once', async () => {
    const a = await app()
    await a.create(TENANT_A)
    await a.create(TENANT_A, 'child-1', childOf('session-1'))
    const tail = (await work(a, 'session-1')).revision
    const again = await a.create(TENANT_A, 'child-1', childOf('session-1'))
    expect(again).toMatchObject({ ok: { receipt: { recovered: true } } })
    expect((await work(a, 'session-1')).revision).toBe(tail)
    expect(recorded(a, 'session-1')).toBe(1)
  })

  it('keeps the root and counts the layers, and refuses the third layer leaving nothing', async () => {
    const a = await app()
    await a.create(TENANT_A)
    await a.create(TENANT_A, 'child-1', childOf('session-1'))
    await a.create(TENANT_A, 'child-2', childOf('child-1'))
    expect((await work(a, 'child-2')).tree).toEqual({ root: sessionId('session-1'), depth: 2 })
    expect((await work(a, 'child-1')).children).toEqual([sessionId('child-2')])
    const count = journals(a)
    expect(await a.create(TENANT_A, 'child-3', childOf('child-2'))).toEqual({
      failure: { kind: 'invalid', field: 'creation.relation', reason: 'the depth would exceed 2' },
    })
    expect(journals(a)).toBe(count)
    expect(recorded(a, 'child-2')).toBe(0)
  })

  it('refuses a child of an archived parent and of a parent the tenant does not have', async () => {
    const a = await app()
    await a.create(TENANT_A)
    await a.create(TENANT_A, 'other')
    const archive: SessionCommand = {
      kind: 'control',
      input: {
        tenant: TENANT_A,
        session: sessionId('other'),
        operation: operationId('archive'),
        intent: { kind: 'archive' },
      },
    }
    await a.port.commit({ access: a.access(TENANT_A, 'other'), command: archive, guards: [] })
    expect(await a.create(TENANT_A, 'child-1', childOf('other'))).toEqual({
      failure: { kind: 'archived' },
    })
    const denied = { failure: { kind: 'denied', action: 'create' } }
    expect(await a.create(TENANT_A, 'child-2', childOf('nobody'))).toEqual(denied)
    expect(await a.create(TENANT_B, 'child-3', childOf('session-1'))).toEqual(denied)
    expect(journals(a, 'dom_1')).toBe(0)
    expect(recorded(a, 'session-1')).toBe(0)
  })

  it('creates a handoff as a root and writes nothing to its origin', async () => {
    const a = await app()
    await a.create(TENANT_A)
    const tail = (await work(a, 'session-1')).revision
    const relation: Relation = { kind: 'handoff', origin: sessionId('session-1'), basis }
    expect('ok' in (await a.create(TENANT_A, 'next', { relation }))).toBe(true)
    const next = await work(a, 'next')
    expect(next.relation).toEqual(relation)
    expect(next.tree).toBeUndefined()
    expect((await work(a, 'session-1')).revision).toBe(tail)
  })
})
