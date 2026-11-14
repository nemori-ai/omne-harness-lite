// The derived identities are pinned to the server entry's: the same inputs give the same bytes, so a
// message sent again through `session/v1` finds the session and the operations the session location
// derived (RFC-0015 §7「派生标识用的文本不改」). The entry's functions are read from its source, as
// its package entry does not export them.
import { describe, expect, it } from 'vitest'
import * as entry from '../../../access/server-entry/src/derivation.ts'
import * as moved from '../src/derivation.ts'
import { fixtureLogin } from './fixtures/world.ts'

const ALICE = fixtureLogin('a')
const TENANT = ALICE.tenantText
const SESSION = 'f'.repeat(64)

describe('derived identities', () => {
  it('keep the identity family texts', () => {
    expect(moved.sessionIdentity(TENANT, 'create-1')).toMatch(/^[0-9a-f]{64}$/)
    expect(moved.sessionIdentity(TENANT, 'create-1')).not.toBe(
      moved.inputIdentity(TENANT, SESSION, 'create-1'),
    )
  })

  it.each(['create-1', '', 'x'.repeat(200), '雪'])(
    'equal the server entry byte for byte for the id %j',
    id => {
      expect(moved.tenantTextOf(ALICE.tenant)).toBe(entry.tenantTextOf(ALICE.tenant))
      expect(moved.sessionIdentity(TENANT, id)).toBe(entry.sessionIdentity(TENANT, id))
      expect(moved.inputIdentity(TENANT, SESSION, id)).toBe(
        entry.inputIdentity(TENANT, SESSION, id),
      )
      expect(moved.createOperation(TENANT, id)).toBe(entry.createOperation(TENANT, id))
      expect(moved.acceptOperation(TENANT, SESSION, id)).toBe(
        entry.acceptOperation(TENANT, SESSION, id),
      )
      expect(moved.controlOperation('login-1', TENANT, SESSION, id)).toBe(
        entry.controlOperation('login-1', TENANT, SESSION, id),
      )
      expect(moved.loginEntryOrigin(ALICE.account.text, id)).toEqual(
        entry.loginEntryOrigin(ALICE.account.text, id),
      )
    },
  )

  it('rejects an unminted tenant as the entry does', () => {
    expect(() => moved.tenantTextOf({} as never)).toThrow(TypeError)
  })
})
