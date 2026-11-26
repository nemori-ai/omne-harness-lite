import { describe, expect, it } from 'vitest'
import type { GoalAction, GoalSessions } from '@omne-harness/goal'
import type { PrincipalVerifier } from '@omne-harness/identity'
import { tenantCodec, type TenantId as LegalTenant } from '@omne-harness/legal-identity'
import { LOGIN_WORK_OWNER, SESSION_WORK_OWNER } from '../../../src/rows/authorization/principals.ts'
import { checkedPrincipal, checkSubject } from '../../../src/rows/goal/check-subject.ts'
import type { GoalHolder } from '../../../src/rows/goal/holder.ts'
import {
  createGoalAuthority,
  lateCalls,
  lateExamining,
  lateSessions,
} from '../../../src/rows/goal/ports.ts'
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
const login = (tenant: LegalTenant) => ({
  kind: 'acting-for-tenant',
  actor: { kind: 'system', component: 'server-entry' },
  tenant,
  work: { owner: LOGIN_WORK_OWNER, work: 'login-1' },
})
const OF_THE_AGENT = ['read', 'propose', 'confirm', 'track'] as const
const OF_THE_PERSON = [
  'read',
  'set',
  'revise',
  'pause',
  'resume',
  'cancel',
  'settle-by-exit',
  'choose-judge',
] as const
const NOT_OF_THE_PERSON = ['abort', 'observe', 'propose', 'confirm', 'track'] as const
const OF_THE_OWNER = [
  'set',
  'revise',
  'pause',
  'resume',
  'cancel',
  'abort',
  'settle-by-exit',
  'choose-judge',
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
  it('the agent of the session reads its goal, proposes, hands in an answered card and keeps its progress list', async () => {
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

  it('the system principal of goals hands in what the program ran again, and does nothing else; nobody else hands it in', async () => {
    const system = { kind: 'system', component: 'goal' }
    expect(await decide(system, 'rerun')).toBe('permitted')
    for (const action of [...OF_THE_AGENT, ...OF_THE_OWNER, 'observe', 'brief', 'submit'] as const)
      expect(await decide(system, action as GoalAction)).toBe('denied')
    const others = [work(A), { kind: 'system', component: 'schedule' }, 'rejected'] as const
    for (const other of others) expect(await decide(other as never, 'rerun')).toBe('denied')
  })

  it('the work of a session may ask for the brief and hand in readings: whether it examines for a goal is the record of that goal', async () => {
    for (const action of ['brief', 'submit'] as const) {
      expect(await decide(work(A), action)).toBe('permitted')
      expect(await decide(work(A, 'session-2'), action)).toBe('denied')
    }
  })

  it('schedule, as the creator of the sessions of its Jobs, reads, sets, cancels and aborts their goals, and does nothing else', async () => {
    const schedule = { kind: 'system', component: 'schedule' }
    for (const action of ['read', 'set', 'cancel', 'abort'] as const)
      expect(await decide(schedule, action)).toBe('permitted')
    const rest = [
      'revise',
      'pause',
      'resume',
      'settle-by-exit',
      'observe',
      'propose',
      'confirm',
      'track',
      'choose-judge',
    ]
    for (const action of rest as GoalAction[]) expect(await decide(schedule, action)).toBe('denied')
    expect(
      await authority(schedule).decide(
        { tenant: textOf(A), subject: checkSubject(schedule) },
        'session-1',
        'set',
      ),
    ).toBe('denied')
  })

  it('a person come in by login reads the goal of any session of their tenant and does what only a person does to it', async () => {
    for (const action of OF_THE_PERSON) {
      expect(await decide(login(A), action)).toBe('permitted')
      expect(await decide(login(A), action, 'another-session')).toBe('permitted')
    }
  })

  it('a person aborts nothing, observes nothing, and does none of what the agent does through its tool', async () => {
    for (const action of NOT_OF_THE_PERSON) expect(await decide(login(A), action)).toBe('denied')
  })

  it('a principal of the tenant that is neither a login nor the work of a session is nobody to its goals', async () => {
    const stranger = { ...work(A), actor: { kind: 'system', component: 'somebody-else' } }
    for (const action of [...OF_THE_PERSON, ...NOT_OF_THE_PERSON])
      expect(await decide(stranger, action)).toBe('denied')
  })

  it('nothing is asked as the check of a person: a check stands on the work of a session only', async () => {
    for (const action of [...OF_THE_PERSON, 'observe'] as const)
      expect(
        await authority(login(A)).decide(
          { tenant: textOf(A), subject: checkSubject(login(A)) },
          'session-1',
          action,
        ),
      ).toBe('denied')
  })

  it('a login of another tenant is denied everything, and one that cannot be verified now has no basis', async () => {
    for (const action of OF_THE_PERSON) expect(await decide(login(B), action)).toBe('denied')
    const asLogin = (verified: Parameters<typeof authority>[0]) =>
      authority(verified).decide({ tenant: textOf(A), subject: login(A) }, 'session-1', 'pause')
    expect(await asLogin('rejected')).toBe('denied')
    expect(await asLogin('unavailable')).toBe('unavailable')
    expect(await asLogin('throws')).toBe('unavailable')
    expect(await asLogin('absent')).toBe('unavailable')
  })

  it('the check of the work of a session observes its goal and asks nothing else of it; the agent itself never observes', async () => {
    const checking = (verified: unknown, action: GoalAction, session = 'session-1') =>
      authority(verified).decide(
        { tenant: textOf(A), subject: checkSubject(verified) },
        session,
        action,
      )
    expect(await checking(work(A), 'observe')).toBe('permitted')
    for (const action of [...OF_THE_AGENT, ...OF_THE_OWNER])
      expect(await checking(work(A), action)).toBe('denied')
    expect(await decide(work(A), 'observe')).toBe('denied')
    expect(await checking(work(A, 'session-2'), 'observe')).toBe('denied')
    expect(await checking(work(B), 'observe')).toBe('denied')
    expect(await checking('unavailable', 'observe')).toBe('unavailable')
  })

  it('a check subject leads back to the principal it was made around, and nothing else is one', () => {
    const principal = work(A)
    expect(checkedPrincipal(checkSubject(principal))).toBe(principal)
    expect(checkSubject(principal)).not.toBe(checkSubject(principal))
    for (const other of [principal, { check: 'goal-check' }, 'goal-check', null, undefined])
      expect(checkedPrincipal(other)).toBeUndefined()
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
  const holder = (): GoalHolder => ({
    sessions: null,
    calls: null,
    history: null,
    decisions: null,
    examining: null,
    changes: null,
    examination: null,
  })
  it('while nothing is mounted a read is unavailable and a reminder stays owed', async () => {
    const empty = holder()
    expect(await lateSessions(empty).facts('t', 's')).toEqual({ kind: 'unavailable' })
    expect(await lateSessions(empty).asked('t', 's')).toEqual({ kind: 'unavailable' })
    const wake = {
      kind: 'start',
      request: 'start/1/1',
      session: 's',
      rendered: '',
      open: '',
      implied: false,
    } as const
    expect(await lateSessions(empty).wake('t', wake)).toBe('unknown')
    expect(await lateCalls(empty).cited('t', 's', ['call-1'], '0')).toEqual({ kind: 'unavailable' })
    expect(await lateSessions(empty).running('t', 's')).toEqual({ kind: 'unavailable' })
    const batch = {
      session: 's',
      request: 'examine/1/1/',
      examiner: null,
      where: null,
      brief: '',
      criteria: [],
    }
    expect(await lateExamining(empty).hand('t', batch)).toEqual({ kind: 'unknown' })
    const nobody = { session: 's', examiner: 'x', request: 'examine/1/1/' }
    expect(await lateExamining(empty).ended('t', nobody)).toBe('unknown')
    await lateExamining(empty).cancel('t', nobody)
    await lateExamining(empty).close('t', { session: 's', examiner: 'x' })
    expect(await lateExamining(empty).cited('t', 'x', 'examine/1/1/', ['x-1'])).toEqual({
      kind: 'unavailable',
    })
  })
  it('once mounted every call goes to what is mounted now', async () => {
    const mounted = holder()
    const sessions = lateSessions(mounted)
    mounted.sessions = {
      facts: async () => ({
        kind: 'read',
        value: { attendance: 'unattended', moment: '3', drive: null },
      }),
      asked: async () => ({ kind: 'read', value: { at: '30', text: '把首页降下来' } }),
      wake: async () => 'sent',
      running: async () => ({ kind: 'read', value: true }),
    } satisfies GoalSessions
    expect(await sessions.running('t', 's')).toEqual({ kind: 'read', value: true })
    const examining = lateExamining(mounted)
    mounted.examining = {
      hand: async () => ({ kind: 'handed', examiner: 'x' }),
      cited: async (_t, _x, _r, refs) => ({ kind: 'read', value: refs }),
      ended: async () => 'ended',
      cancel: async () => undefined,
      close: async () => undefined,
    }
    const out = { session: 's', examiner: 'x', request: 'examine/1/1/' }
    expect(await examining.ended('t', out)).toBe('ended')
    await examining.cancel('t', out)
    await examining.close('t', { session: 's', examiner: 'x' })
    const batch = {
      session: 's',
      request: 'examine/1/1/',
      examiner: null,
      where: null,
      brief: '',
      criteria: [],
    }
    expect(await examining.hand('t', batch)).toEqual({ kind: 'handed', examiner: 'x' })
    expect(await sessions.asked('t', 's')).toEqual({
      kind: 'read',
      value: { at: '30', text: '把首页降下来' },
    })
    expect(await sessions.facts('t', 's')).toEqual({
      kind: 'read',
      value: { attendance: 'unattended', moment: '3', drive: null },
    })
    const wake = {
      kind: 'resume',
      request: 'resume/1/2',
      session: 's',
      rendered: '',
      open: '',
      implied: false,
    } as const
    expect(await sessions.wake('t', wake)).toBe('sent')
    const calls = lateCalls(mounted)
    mounted.calls = { cited: async (_t, _s, refs) => ({ kind: 'read', value: refs }) }
    expect(await calls.cited('t', 's', ['call-1'], '0')).toEqual({
      kind: 'read',
      value: ['call-1'],
    })
  })
})
