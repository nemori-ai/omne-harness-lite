import { describe, expect, it } from 'vitest'
import { createFixedSessionCursorSigning } from '@omne-harness/session-cordis-contract/testing'
import { testingTenant } from '@omne-harness/session-contract/testing'
import { createSearchCursorSeal } from '../src/index.ts'

const TENANT = testingTenant('org_h1st0rycvrs0r0000000000000', 'acc_h1st0rycvrs0r0000000000000')
const OTHER = testingTenant('org_h1st0rycvrs0r0ther00000000', 'acc_h1st0rycvrs0r0ther00000000')
const STATE = { query: 'q', generation: 1, frozen: [], tail: null, before: '12', last: null }

function sealing(ttlMs = 60_000) {
  const clock = { now: 1_000_000 }
  const signing = createFixedSessionCursorSigning()
  const seal = createSearchCursorSeal({ signing, now: () => clock.now, ttlMs })
  return { clock, signing, seal }
}

describe('the cursors of the history search', () => {
  it('opens what it sealed for the same tenant', async () => {
    const { seal } = sealing()
    const sealed = await seal.seal(TENANT, STATE as never)
    expect(typeof sealed).toBe('string')
    expect(await seal.open(TENANT, sealed!)).toEqual(STATE)
  })

  it('refuses a cursor of another tenant, a changed one, an expired one, and what is no cursor', async () => {
    const { seal, clock } = sealing(1000)
    const sealed = (await seal.seal(TENANT, STATE as never))!
    expect(await seal.open(OTHER, sealed)).toBe('invalid')
    const [body, key, signature] = sealed.split('.') as [string, string, string]
    const forged = Buffer.from(JSON.stringify({ kind: 'history.search', state: {} })).toString(
      'base64url',
    )
    expect(await seal.open(TENANT, `${forged}.${key}.${signature}`)).toBe('invalid')
    expect(await seal.open(TENANT, `${body}.${key}`)).toBe('invalid')
    expect(await seal.open(TENANT, 'not a cursor')).toBe('invalid')
    clock.now += 1001
    expect(await seal.open(TENANT, sealed)).toBe('invalid')
  })

  it('does not open the cursor of another read of the session storage', async () => {
    const { seal, signing } = sealing()
    const payload = new TextEncoder().encode(
      JSON.stringify({ kind: 'directory.list', tenant: null, session: null, expires: 2e12 }),
    )
    const domain = new TextEncoder().encode('omne-harness/session-storage-sql/cursor/v1\u0000')
    const signed = await signing.sign(new Uint8Array([...domain, ...payload]))
    if (signed.kind !== 'signed') throw new Error('sign')
    const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url')
    const { keyId, signature } = signed.value
    const other = `${b64(payload)}.${b64(new TextEncoder().encode(keyId))}.${b64(signature)}`
    expect(await seal.open(TENANT, other)).toBe('invalid')
  })

  it('says unavailable when the signing key is away, sealing and opening', async () => {
    const { seal } = sealing()
    const sealed = (await seal.seal(TENANT, STATE as never))!
    const away = createSearchCursorSeal({
      signing: {
        sign: async () => ({ kind: 'unavailable' }),
        verify: async () => ({ kind: 'unavailable' }),
      },
    })
    expect(await away.seal(TENANT, STATE as never)).toBeNull()
    expect(await away.open(TENANT, sealed)).toBe('unavailable')
  })
})
