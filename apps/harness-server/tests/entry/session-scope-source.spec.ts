import { expect, it } from 'vitest'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import type { SessionId, SessionPrincipalBindingSource } from '@omne-harness/session-contract'
import {
  createSessionScopeSource,
  type SessionScopeOwnership,
  type SessionScopeOwnershipSource,
} from '../../src/entry/session-scope-source.ts'
import { fixtureTenant, okOf } from './support.ts'

const tenant = fixtureTenant('a')
const otherTenant = fixtureTenant('b')
const session = 'ses_1' as SessionId
const scope = okOf(decodeScopeRef({ ref: 'test-scope' }), 'scope')
const ownership: SessionScopeOwnership = { kind: 'bound', tenant, session, generation: 'g1' }
const source = { owner: 'test', record: 'r1', revision: '1', digest: 'd' }
type Reading = Awaited<ReturnType<SessionPrincipalBindingSource['read']>>

it('projects only a session confirmed by both live sources and preserves all non-bound states', async () => {
  let owner: SessionScopeOwnership = ownership
  let binding: Reading = { ok: { kind: 'bound', tenant, session, source } }
  let reads = 0
  const subjects = createSessionScopeSource({
    readOwnership: () => ({ lookup: async () => owner }),
    readPrincipalBindings: () => ({
      read: async input => {
        reads++
        expect(input).toEqual({ tenant, session })
        return binding
      },
    }),
  })
  expect(await subjects.scopeOwners.lookup(scope)).toEqual(ownership)
  expect(await subjects.bindings.lookup(scope)).toEqual({ kind: 'bound', tenant })
  for (const mismatch of [
    { tenant: otherTenant, session },
    { tenant, session: 'ses_2' as SessionId },
  ]) {
    binding = { ok: { kind: 'bound', ...mismatch, source } }
    expect(await subjects.bindings.lookup(scope)).toEqual({ kind: 'unavailable' })
  }
  binding = { ok: { kind: 'not-bound' } }
  expect(await subjects.bindings.lookup(scope)).toEqual({ kind: 'unbound' })
  const before = reads
  for (const kind of ['unbound', 'unavailable', 'unknown'] as const) {
    owner = { kind }
    expect(await subjects.bindings.lookup(scope)).toEqual({ kind })
  }
  expect(reads).toBe(before)
})

it('closes on absent, failed, throwing and withdrawn sources without exposing errors', async () => {
  let owners: SessionScopeOwnershipSource | undefined
  let principals: SessionPrincipalBindingSource | undefined
  const subjects = createSessionScopeSource({
    readOwnership: () => owners,
    readPrincipalBindings: () => principals,
  })
  expect(await subjects.scopeOwners.lookup(scope)).toEqual({ kind: 'unavailable' })
  owners = { lookup: async () => ownership }
  expect(await subjects.scopeOwners.lookup(scope)).toEqual({ kind: 'unavailable' })
  principals = {
    read: async () => ({ failure: { kind: 'unavailable', owner: 'test', diagnostic: 'secret' } }),
  }
  expect(await subjects.scopeOwners.lookup(scope)).toEqual({ kind: 'unavailable' })
  principals = {
    read: async () => {
      throw new Error('secret')
    },
  }
  expect(await subjects.scopeOwners.lookup(scope)).toEqual({ kind: 'unavailable' })
  principals = { read: async () => ({ ok: { kind: 'bound', tenant, session, source } }) }
  expect((await subjects.scopeOwners.lookup(scope)).kind).toBe('bound')
  owners = undefined
  expect(await subjects.scopeOwners.lookup(scope)).toEqual({ kind: 'unavailable' })
  owners = {
    lookup: async () => {
      throw new Error('secret')
    },
  }
  expect(await subjects.scopeOwners.lookup(scope)).toEqual({ kind: 'unavailable' })
})
