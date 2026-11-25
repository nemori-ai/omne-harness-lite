import type { AnsweredCard, Attendance, GoalCaller } from '@omne-harness/goal-contract'
import type {
  AuthorityAnswer,
  GoalAction,
  GoalAuthority,
  GoalCalls,
  GoalCards,
  GoalSessions,
  SendAnswer,
  WakeToSend,
} from '../ports.ts'

export type FakeAuthority = GoalAuthority &
  Readonly<{
    answer(next: AuthorityAnswer | ((action: GoalAction) => AuthorityAnswer)): void
    asked: { caller: GoalCaller; session: string; action: GoalAction }[]
  }>

/** Permits everything until told otherwise, and remembers what it was asked. */
export function fakeAuthority(): FakeAuthority {
  let rule: (action: GoalAction) => AuthorityAnswer = () => 'permitted'
  const asked: FakeAuthority['asked'] = []
  return {
    asked,
    answer: next => void (rule = typeof next === 'function' ? next : () => next),
    async decide(caller, session, action) {
      asked.push({ caller, session, action })
      return rule(action)
    },
  }
}

export type FakeSessions = GoalSessions &
  Readonly<{
    add(session: string, attendance: Attendance): void
    readable(on: boolean): void
    sendNext(answer: SendAnswer): void
    woken: WakeToSend[]
  }>

/** Sessions with the one fact a goal stands on, and a record of every reminder handed over. */
export function fakeSessions(): FakeSessions {
  const known = new Map<string, Attendance>()
  const woken: WakeToSend[] = []
  let canRead = true
  let next: SendAnswer = 'sent'
  return {
    woken,
    add: (session, attendance) => void known.set(session, attendance),
    readable: on => void (canRead = on),
    sendNext: answer => void (next = answer),
    async facts(_tenant, session) {
      if (!canRead) return { kind: 'unavailable' }
      const attendance = known.get(session)
      return { kind: 'read', value: attendance === undefined ? null : { attendance } }
    },
    async wake(_tenant, wake) {
      const answer = next
      next = 'sent'
      if (answer !== 'refused') woken.push(wake)
      return answer
    },
  }
}

export type FakeCards = GoalCards &
  Readonly<{ answer(card: AnsweredCard): void; readable(on: boolean): void }>

export function fakeCards(): FakeCards {
  const held = new Map<string, AnsweredCard>()
  let canRead = true
  return {
    answer: card => void held.set(card.card, card),
    readable: on => void (canRead = on),
    async answered(_tenant, _session, card) {
      return canRead ? { kind: 'read', value: held.get(card) ?? null } : { kind: 'unavailable' }
    },
  }
}

export type FakeCalls = GoalCalls &
  Readonly<{ made(...refs: string[]): void; readable(on: boolean): void; asked: string[][] }>

/** The tool calls a session is known to have made, and what was asked about them. */
export function fakeCalls(): FakeCalls {
  const real = new Set<string>()
  const asked: string[][] = []
  let canRead = true
  return {
    asked,
    made: (...refs) => void refs.forEach(ref => real.add(ref)),
    readable: on => void (canRead = on),
    async cited(_tenant, _session, refs, since) {
      asked.push([since, ...refs])
      if (!canRead) return { kind: 'unavailable' }
      return { kind: 'read', value: refs.filter(ref => real.has(ref)) }
    },
  }
}
