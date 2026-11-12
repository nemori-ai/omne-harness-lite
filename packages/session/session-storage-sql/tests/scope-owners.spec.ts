// The scope owner source of the SQL storage (SessionScopeOwnerSource): the session that minted a
// Context scope, read back from the row that the commit minting it wrote. What is checked: creation
// and unarchiving each leave the owner of the scope they mint, in the tenant that minted it; a new
// source over the same storage, as after a restart, answers from the rows alone; a scope no session
// minted is `unknown`; a read that could not look in every domain is `unavailable`, never `unknown`.
import { describe, expect, it } from 'vitest'
import { contextScopeOf, type SessionCommand } from '@omne-harness/session-contract'
import { operationId, sessionId } from '@omne-harness/session-contract/testing'
import { createSessionScopeOwners } from '../src/scope-owners.ts'
import { app, TENANT_A, TENANT_B, type App } from './fixtures/app.ts'
import { kindOf } from './fixtures/entries.ts'

const SESSION = sessionId('session-1')

const control = (a: App, kind: 'archive' | 'unarchive', name: string) =>
  a.port.commit({
    access: a.access(TENANT_A),
    command: {
      kind: 'control',
      input: { tenant: TENANT_A, session: SESSION, operation: operationId(name), intent: { kind } },
    } as SessionCommand as never,
    guards: [],
  })

/** A new source over the storage of `a`: nothing is kept in it, as in a process just started. */
const fresh = (a: App) =>
  createSessionScopeOwners({ storage: a.provider.storage, domains: a.storageOptions.domains })

const scopeOf = (generation: string, tenant = TENANT_A) =>
  contextScopeOf({ tenant, session: SESSION, generation })

describe('the owner of a scope, from the rows of the commit that minted it', () => {
  it('answers the creating session for generation 1, in its tenant, from a source that never saw it', async () => {
    const a = await app()
    expect(kindOf(await a.create(TENANT_B))).toBeUndefined()
    expect(await fresh(a).lookup({ scope: scopeOf('1', TENANT_B) })).toEqual({
      ok: { kind: 'owned', tenant: TENANT_B, session: SESSION, generation: '1' },
    })
  })

  it('answers the generation that an unarchiving minted, and still the ended one before it', async () => {
    const a = await app()
    expect(kindOf(await a.create(TENANT_A))).toBeUndefined()
    expect(kindOf(await control(a, 'archive', 'archive-1'))).toBeUndefined()
    expect(kindOf(await control(a, 'unarchive', 'unarchive-1'))).toBeUndefined()
    const source = fresh(a)
    for (const generation of ['1', '2'])
      expect(await source.lookup({ scope: scopeOf(generation) })).toEqual({
        ok: { kind: 'owned', tenant: TENANT_A, session: SESSION, generation },
      })
  })

  it('answers unknown for a scope no session minted, and for the scope of another tenant', async () => {
    const a = await app()
    expect(kindOf(await a.create(TENANT_A))).toBeUndefined()
    const source = fresh(a)
    expect(await source.lookup({ scope: scopeOf('2') })).toEqual({ ok: { kind: 'unknown' } })
    expect(await source.lookup({ scope: scopeOf('1', TENANT_B) })).toEqual({
      ok: { kind: 'unknown' },
    })
    expect(await source.lookup({ scope: 'session-scope:forged' })).toEqual({
      ok: { kind: 'unknown' },
    })
  })
})

describe('a lookup that could not look', () => {
  it('is unavailable, not unknown, when the domain of a tenant does not answer', async () => {
    const a = await app()
    expect(kindOf(await a.create(TENANT_B))).toBeUndefined()
    a.provider.failReads('session.scope-owner')
    expect(kindOf(await fresh(a).lookup({ scope: scopeOf('1', TENANT_B) }))).toBe('unavailable')
  })

  it('keeps an owned answer: a read after the storage stops answering still knows it', async () => {
    const a = await app()
    expect(kindOf(await a.create(TENANT_A))).toBeUndefined()
    const source = fresh(a)
    const owned = await source.lookup({ scope: scopeOf('1') })
    a.provider.failReads('session.scope-owner')
    expect(await source.lookup({ scope: scopeOf('1') })).toEqual(owned)
    source.stop()
    expect(kindOf(await source.lookup({ scope: scopeOf('1') }))).toBe('unavailable')
  })
})
