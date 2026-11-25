import {
  DEFAULT_JUDGE_CONFIG,
  type AnsweredCard,
  type Attendance,
  type GoalCaller,
  type JudgeConfig,
  type JudgeReply,
  type ObservedCall,
} from '@omne-harness/goal-contract'
import type {
  AuthorityAnswer,
  DecisionAsk,
  GoalAction,
  GoalAuthority,
  GoalCalls,
  GoalCards,
  GoalDecisions,
  GoalHistory,
  GoalJudging,
} from '../ports.ts'
import type { Driven, GoalSessions, SendAnswer, WakeToSend } from '../sessions-port.ts'

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
    drive(session: string, driven: Driven | null): void
    readable(on: boolean): void
    sendNext(answer: SendAnswer): void
    woken: WakeToSend[]
  }>

/** Sessions with the one fact a goal stands on, and a record of every reminder handed over. */
export function fakeSessions(): FakeSessions {
  const known = new Map<string, Attendance>()
  const driven = new Map<string, Driven>()
  const woken: WakeToSend[] = []
  let canRead = true
  let moment = 0
  let next: SendAnswer = 'sent'
  return {
    woken,
    add: (session, attendance) => void known.set(session, attendance),
    drive: (session, input) =>
      void (input === null ? driven.delete(session) : driven.set(session, input)),
    readable: on => void (canRead = on),
    sendNext: answer => void (next = answer),
    async facts(_tenant, session) {
      if (!canRead) return { kind: 'unavailable' }
      const attendance = known.get(session)
      if (attendance === undefined) return { kind: 'read', value: null }
      moment += 1
      const drive = driven.get(session) ?? null
      return { kind: 'read', value: { attendance, moment: String(moment), drive } }
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

export type FakeHistory = GoalHistory &
  Readonly<{
    made(...calls: ObservedCall[]): void
    say(text: string | null): void
    readable(on: boolean): void
  }>

/** The tool calls a session made, as a judging is shown them. */
export function fakeHistory(): FakeHistory {
  const calls: ObservedCall[] = []
  let canRead = true
  let reply: string | null = null
  return {
    made: (...more) => void calls.push(...more),
    say: text => void (reply = text),
    readable: on => void (canRead = on),
    async calls() {
      return canRead ? { kind: 'read', value: [...calls] } : { kind: 'unavailable' }
    },
    async said() {
      return canRead ? { kind: 'read', value: reply } : { kind: 'unavailable' }
    },
  }
}

export type FakeDecisions = GoalDecisions &
  Readonly<{
    /** How each ask is answered, by its request and the identity it was asked under. */
    answer(next: (ask: DecisionAsk) => JudgeReply | Promise<JudgeReply>): void
    asked: DecisionAsk[]
  }>

/** A judge that answers as a test tells it to, and remembers every call it was asked for. */
export function fakeDecisions(): FakeDecisions {
  let rule: Parameters<FakeDecisions['answer']>[0] = () => null
  const asked: DecisionAsk[] = []
  return {
    asked,
    answer: next => void (rule = next),
    async ask(input) {
      asked.push(input)
      return rule(input)
    },
  }
}

export type FakeJudging = GoalJudging &
  Readonly<{ set(config: Partial<JudgeConfig>): void; readable(on: boolean): void }>

export function fakeJudging(): FakeJudging {
  let config: JudgeConfig = DEFAULT_JUDGE_CONFIG
  let canRead = true
  return {
    set: change => void (config = { ...config, ...change }),
    readable: on => void (canRead = on),
    async config() {
      return canRead ? { kind: 'read', value: config } : { kind: 'unavailable' }
    },
  }
}
