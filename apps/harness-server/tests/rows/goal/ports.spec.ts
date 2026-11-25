import { describe, expect, it } from 'vitest'
import type { GoalAction, GoalCards, GoalSessions } from '@omne-harness/goal'
import type { PrincipalVerifier } from '@omne-harness/identity'
import { tenantCodec, type TenantId as LegalTenant } from '@omne-harness/legal-identity'
import { SESSION_WORK_OWNER } from '../../../src/rows/authorization/principals.ts'
import type { GoalHolder } from '../../../src/rows/goal/holder.ts'
import { createGoalAuthority, lateCards, lateSessions } from '../../../src/rows/goal/ports.ts'
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
const textOf = (tenant: LegalTenant) => (tenantCodec.encode(tenant) as { value: string }).value
const work = (tenant: LegalTenant, session = 'session-1') => ({
  kind: 'acting-for-tenant',
  actor: { kind: 'system', component: SESSION_WORK_COMPONENT },
  tenant,
  work: { owner: SESSION_WORK_OWNER, work: session },
})
const OF_THE_AGENT = ['read', 'propose', 'confirm'] as const
const OF_THE_OWNER = [
  'set',
  'revise',
  'pause',
  'resume',
  'cancel',
  'abort',
  'settle-by-exit',
] as const

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
  return createGoalAuthority({ verifier: () => (verified === 'absent' ? undefined : verifier) })
}
const decide = (
  verified: Parameters<typeof authority>[0],
  action: GoalAction,
  session = 'session-1',
) => authority(verified).decide({ tenant: textOf(A), subject: verified }, session, action)

describe('who may ask what of the goal of a session on the release', () => {
  it('the agent of the session reads its goal, proposes, and hands in an answered card', async () => {
    for (const action of OF_THE_AGENT) expect(await decide(work(A), action)).toBe('permitted')
  })

  it('the agent of the session sets, revises, pauses, resumes, cancels, aborts and settles nothing', async () => {
    for (const action of OF_THE_OWNER) expect(await decide(work(A), action)).toBe('denied')
  })

  it.each([
    ['the work principal of another session', work(A, 'session-2')],
    ['the work principal of another tenant', work(B)],
    ['a system principal', { kind: 'system', component: 'goal' }],
    ['a principal the verifier rejects', 'rejected'],
  ])('%s is denied every action', async (_name, verified) => {
    for (const action of [...OF_THE_AGENT, ...OF_THE_OWNER])
      expect(await decide(verified, action)).toBe('denied')
  })

  it('a tenant text that names no tenant is denied before anything is verified', async () => {
    const answer = authority('throws').decide(
      { tenant: 'nobody', subject: {} },
      'session-1',
      'read',
    )
    expect(await answer).toBe('denied')
  })

  it.each(['unavailable', 'throws', 'absent'] as const)(
    'a verifier that is %s gives no basis, never a permission',
    async state => expect(await decide(state, 'read')).toBe('unavailable'),
  )
})

describe('the ports the contributing rows mount', () => {
  const holder = (): GoalHolder => ({ sessions: null, cards: null })
  it('while nothing is mounted a read is unavailable, a reminder stays owed and no card is held', async () => {
    const empty = holder()
    expect(await lateSessions(empty).facts('t', 's')).toEqual({ kind: 'unavailable' })
    const wake = { kind: 'start', request: 'start/1/1', session: 's', rendered: '' } as const
    expect(await lateSessions(empty).wake('t', wake)).toBe('unknown')
    expect(await lateCards(empty).answered('t', 's', 'card')).toEqual({ kind: 'unavailable' })
  })
  it('once mounted every call goes to what is mounted now', async () => {
    const mounted = holder()
    const sessions = lateSessions(mounted)
    const cards = lateCards(mounted)
    mounted.sessions = {
      facts: async () => ({ kind: 'read', value: { attendance: 'unattended' } }),
      wake: async () => 'sent',
    } satisfies GoalSessions
    mounted.cards = { answered: async () => ({ kind: 'read', value: null }) } satisfies GoalCards
    expect(await sessions.facts('t', 's')).toEqual({
      kind: 'read',
      value: { attendance: 'unattended' },
    })
    const wake = { kind: 'resume', request: 'resume/1/2', session: 's', rendered: '' } as const
    expect(await sessions.wake('t', wake)).toBe('sent')
    expect(await cards.answered('t', 's', 'card')).toEqual({ kind: 'read', value: null })
  })
})
