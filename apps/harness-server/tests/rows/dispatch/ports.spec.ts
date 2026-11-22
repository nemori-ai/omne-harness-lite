import { describe, expect, it } from 'vitest'
import type { DispatchSessions, ReportWaits } from '@omne-harness/dispatch'
import type { CallContext, DispatchId, SessionRef, TenantId } from '@omne-harness/dispatch-contract'
import type { PrincipalVerifier } from '@omne-harness/identity'
import { tenantCodec, type TenantId as LegalTenant } from '@omne-harness/legal-identity'
import { SESSION_WORK_OWNER } from '../../../src/rows/authorization/principals.ts'
import type { DispatchHolder } from '../../../src/rows/dispatch/holder.ts'
import {
  createDispatchAuthority,
  definitionsOf,
  lateCopies,
  lateSessions,
  lateWaits,
} from '../../../src/rows/dispatch/ports.ts'
import { SESSION_WORK_COMPONENT } from '../../../src/rows/tool-runtime/session-work.ts'

const tenantOf = (account: string): LegalTenant => {
  const parsed = tenantCodec.parse(
    JSON.stringify({ organization: `org_${'a'.repeat(26)}`, account: `acc_${account.repeat(26)}` }),
  )
  if (!parsed.ok) throw new Error('fixture tenant')
  return parsed.value
}
const A = tenantOf('1')
const B = tenantOf('2')
const textOf = (tenant: LegalTenant) =>
  (tenantCodec.encode(tenant) as { value: string }).value as TenantId
const work = (tenant: LegalTenant, session = 'session-1') => ({
  kind: 'acting-for-tenant',
  actor: { kind: 'system', component: SESSION_WORK_COMPONENT },
  tenant,
  work: { owner: SESSION_WORK_OWNER, work: session },
})
const SYSTEM = { kind: 'system', component: 'dispatch' }
const ACTIONS = ['dispatch', 'withdraw', 'report', 'message', 'read'] as const

function authority(verified: unknown | 'rejected' | 'unavailable' | 'throws' | 'absent') {
  const verifier = {
    async verify() {
      if (verified === 'throws') throw new Error('down')
      if (verified === 'unavailable') return { kind: 'unavailable' }
      return verified === 'rejected'
        ? { kind: 'rejected' }
        : { kind: 'verified', principal: verified }
    },
  } as unknown as PrincipalVerifier
  return createDispatchAuthority({
    verifier: () => (verified === 'absent' ? undefined : verifier),
    system: () => SYSTEM,
  })
}
const ctx = (subject: unknown, tenant = A, session = 'session-1'): CallContext => ({
  tenant: textOf(tenant),
  subject,
  session: session as SessionRef,
})

describe('who may ask dispatch for what on the release', () => {
  it('permits every action to the verified work principal of the session the call names', async () => {
    const principal = work(A)
    for (const action of ACTIONS)
      expect(await authority(principal).decide(ctx(principal), action)).toBe('permitted')
  })

  it.each([
    ['the work principal of another session', work(A, 'session-2'), ctx({})],
    ['the work principal of another tenant', work(B), ctx({})],
    ['a principal the verifier rejects', 'rejected', ctx({})],
    ['a verified principal that is no session work principal', { kind: 'login' }, ctx({})],
    ['a tenant text that is no tenant', work(A), { ...ctx({}), tenant: 'nobody' as TenantId }],
  ] as const)('denies %s', async (_name, verified, context) => {
    for (const action of ACTIONS)
      expect(await authority(verified).decide(context, action)).toBe('denied')
  })

  it.each(['unavailable', 'throws', 'absent'] as const)(
    'answers unavailable, not denied, when the verifier is %s',
    async state => {
      expect(await authority(state).decide(ctx({}), 'dispatch')).toBe('unavailable')
    },
  )

  it('lets the system principal of dispatch read, and do nothing else', async () => {
    const decide = (action: (typeof ACTIONS)[number]) =>
      authority('rejected').decide(ctx(SYSTEM, A, 'system'), action)
    expect(await decide('read')).toBe('permitted')
    for (const action of ACTIONS.filter(name => name !== 'read'))
      expect(await decide(action)).toBe('denied')
    const copy = authority('rejected').decide(ctx({ ...SYSTEM }, A, 'system'), 'read')
    expect(await copy).toBe('denied')
  })

  it('does not take a call without a subject for the system principal while that principal is absent', async () => {
    const absent = createDispatchAuthority({ verifier: () => undefined, system: () => undefined })
    expect(await absent.decide(ctx(undefined, A, 'system'), 'read')).not.toBe('permitted')
  })
})

describe('the type of an Agent definition as a tenant sees it', () => {
  const catalog = {
    visibleTo: async (tenant: LegalTenant) =>
      textOf(tenant) === textOf(A)
        ? [{ name: 'coding', type: 'master' as const, summary: 's' }]
        : [],
  }

  it('reads the type from the catalogue of the tenant, and null for a name the tenant does not see', async () => {
    const definitions = definitionsOf(() => catalog)
    expect(await definitions.typeOf(textOf(A), 'coding')).toEqual({ kind: 'read', value: 'master' })
    expect(await definitions.typeOf(textOf(A), 'other')).toEqual({ kind: 'read', value: null })
    expect(await definitions.typeOf(textOf(B), 'coding')).toEqual({ kind: 'read', value: null })
    expect(await definitions.typeOf('nobody' as TenantId, 'coding')).toEqual({
      kind: 'read',
      value: null,
    })
  })

  it('is unavailable while the catalogue cannot know what the tenant sees', async () => {
    const unknown = { visibleTo: async () => undefined }
    expect(await definitionsOf(() => unknown).typeOf(textOf(A) as TenantId, 'coding')).toEqual(
      await definitionsOf(() => undefined).typeOf(textOf(A) as TenantId, 'coding'),
    )
    expect(await definitionsOf(() => unknown).typeOf(textOf(A) as TenantId, 'coding')).not.toEqual({
      kind: 'read',
      value: null,
    })
  })

  it('does not ask the catalogue for a tenant text that is no tenant', async () => {
    const asked: unknown[] = []
    const everything = {
      visibleTo: async (tenant: LegalTenant) => {
        asked.push(tenant)
        return [{ name: 'coding', type: 'master' as const, summary: 's' }]
      },
    }
    expect(await definitionsOf(() => everything).typeOf('nobody' as TenantId, 'coding')).toEqual({
      kind: 'read',
      value: null,
    })
    expect(asked).toEqual([])
  })

  it('is unavailable while the catalogue is not mounted', async () => {
    expect(await definitionsOf(() => undefined).typeOf(textOf(A), 'coding')).toEqual({
      kind: 'unavailable',
    })
  })
})

describe('the ports the contributing rows mount', () => {
  const T = textOf(A)
  const S = 'session-1' as SessionRef
  const D = `dsp_${'1'.repeat(64)}` as DispatchId
  const started = { id: D, session: S }

  it('answers every read as unavailable and makes no write while no row has mounted its port', async () => {
    const holder: DispatchHolder = { sessions: null, waits: null, copies: null }
    const sessions = lateSessions(holder)
    expect(await sessions.row(T, S)).toEqual({ kind: 'unavailable' })
    expect(await sessions.startFate(T, started)).toEqual({ kind: 'unavailable' })
    expect(await sessions.has(T, S, 'report/x')).toEqual({ kind: 'unavailable' })
    expect(await sessions.create(T, {} as never)).toEqual({ kind: 'unknown' })
    expect(await sessions.send(T, {} as never)).toEqual({ kind: 'unknown' })
    expect(await sessions.cancelStart(T, started)).toBe('unknown')
    expect(await lateWaits(holder).hand(T, {} as never, {} as never)).toBe('unreadable')
    expect(sessions.sessionOf(T, D)).toMatch(/^[0-9a-f]{64}$/u)
  })

  it('reads the mounted port at each call, so a row that comes and goes is seen', async () => {
    const holder: DispatchHolder = { sessions: null, waits: null, copies: null }
    const sessions = lateSessions(holder)
    const waits = lateWaits(holder)
    const row = { kind: 'read', value: null } as const
    holder.sessions = {
      row: async () => row,
      cancelStart: async () => 'stopped',
    } as unknown as DispatchSessions
    holder.waits = { hand: async () => 'closed' } as unknown as ReportWaits
    expect(await sessions.row(T, S)).toEqual(row)
    expect(await sessions.cancelStart(T, started)).toBe('stopped')
    expect(await waits.hand(T, {} as never, {} as never)).toBe('closed')
    holder.sessions = null
    holder.waits = null
    expect(await sessions.row(T, S)).toEqual({ kind: 'unavailable' })
    expect(await waits.hand(T, {} as never, {} as never)).toBe('unreadable')
  })

  it('cannot fix the moment of a spawn while the row that knows Session is not started, and asks it when it is', async () => {
    const holder: DispatchHolder = { sessions: null, waits: null, copies: null }
    const copies = lateCopies(holder)
    expect(await copies.moment(T, S, 'call-1')).toEqual({ kind: 'unavailable' })
    const fixed = { kind: 'read', value: { kind: 'moment', moment: 'm' } } as const
    const asked: unknown[] = []
    holder.copies = {
      moment: async (...input) => {
        asked.push(input)
        return fixed
      },
    }
    expect(await copies.moment(T, S, 'call-1')).toEqual(fixed)
    expect(asked).toEqual([[T, S, 'call-1']])
    holder.copies = null
    expect(await copies.moment(T, S, 'call-1')).toEqual({ kind: 'unavailable' })
  })
})
