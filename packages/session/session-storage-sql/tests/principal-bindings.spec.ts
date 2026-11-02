// The session binding source of the SQL storage (D-AUTH r4 4.1, R1-D14 O3): the binding suite of
// session-cordis-contract on the real participant and read handlers, the work principals double
// over it for another tenant, and the failures that must not read as `not-bound`.
import { describe, expect, it } from 'vitest'
import { runConformanceCase, sessionId } from '@omne-harness/session-contract/testing'
import {
  createMemorySessionWorkPrincipals,
  sessionPrincipalBindingsConformance,
} from '@omne-harness/session-cordis-contract/testing'
import { app, TENANT_A, TENANT_B, TENANT_C } from './fixtures/app.ts'
import { kindOf } from './fixtures/entries.ts'

const SESSION = sessionId('session-1')

async function established() {
  const a = await app()
  expect(kindOf(await a.create(TENANT_A))).toBeUndefined()
  return a
}

describe('session-cordis-contract binding conformance on the SQL storage', () => {
  for (const test of sessionPrincipalBindingsConformance())
    it(`${test.clause}: ${test.name}`, async () => {
      const a = await established()
      const fixture = {
        source: a.bindings,
        bound: { tenant: TENANT_A, session: SESSION },
        otherTenant: TENANT_B,
      }
      expect(await runConformanceCase(test, fixture)).toEqual({ kind: 'passed' })
    })
})

describe('the binding read of an established session', () => {
  it('answers the authoritative record: its tenant, its session and the source of its state', async () => {
    const a = await established()
    const work = await a.port.readWork(a.access(TENANT_A))
    if (!('ok' in work)) throw new Error('readWork failed')
    const read = await a.bindings.read({ tenant: TENANT_A, session: SESSION })
    expect(read).toEqual({
      ok: { kind: 'bound', tenant: work.ok.tenant, session: SESSION, source: work.ok.source },
    })
  })

  it('does not ask the access check, and still answers when the check would deny', async () => {
    const a = await established()
    a.denyTenant(TENANT_A)
    const asked = a.accessCheck.controls.asked().length
    const read = await a.bindings.read({ tenant: TENANT_A, session: SESSION })
    expect('ok' in read && read.ok.kind).toBe('bound')
    expect(a.accessCheck.controls.asked().length).toBe(asked)
  })
})

describe('another tenant', () => {
  it('a work principal of tenant B for the session of tenant A is denied, and none is issued', async () => {
    const a = await established()
    const issued: string[] = []
    const principals = createMemorySessionWorkPrincipals<string>({
      bindings: a.bindings,
      issue: request => {
        issued.push(request.actor)
        return `${request.actor}/${request.session}`
      },
    })
    const stranger = await principals.forSession({
      actor: 'coordinator',
      tenant: TENANT_B,
      session: SESSION,
    })
    expect(kindOf(stranger)).toBe('denied')
    expect(issued).toEqual([])
    const owner = await principals.forSession({
      actor: 'coordinator',
      tenant: TENANT_A,
      session: SESSION,
    })
    expect(owner).toEqual({ ok: 'coordinator/session-1' })
  })
})

describe('a read that could not look', () => {
  it('a tenant without a domain in the directory is unavailable, not not-bound', async () => {
    const a = await established()
    const read = await a.bindings.read({ tenant: TENANT_C, session: SESSION })
    expect(kindOf(read)).toBe('unavailable')
  })

  it('a storage read that does not return is unavailable, not not-bound', async () => {
    const a = await established()
    // The binding reads the authoritative state row of the session through the work handler.
    a.provider.failReads('session.work')
    const read = await a.bindings.read({ tenant: TENANT_A, session: SESSION })
    expect(kindOf(read)).toBe('unavailable')
  })

  it('a directory that answers another tenant is unavailable, not not-bound', async () => {
    const a = await established()
    a.directory.swap = a.directory.entries[0] ?? null
    const read = await a.bindings.read({ tenant: TENANT_B, session: SESSION })
    expect(kindOf(read)).toBe('unavailable')
  })
})
