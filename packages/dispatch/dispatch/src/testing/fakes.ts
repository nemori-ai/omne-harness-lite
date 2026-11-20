import { createHash } from 'node:crypto'
import type {
  CallContext,
  DispatchId,
  Instant,
  SessionRef,
  TenantId,
  WaitAnswer,
} from '@omne-harness/dispatch-contract'
import type {
  AgentDefinitions,
  AuthorityAction,
  AuthorityAnswer,
  Clock,
  ContextCopies,
  ContextMoment,
  DispatchAuthority,
} from '../ports.ts'
import type {
  CancelAnswer,
  CreateAnswer,
  DispatchSessions,
  InputFate,
  InputToSend,
  SendAnswer,
  SessionRow,
  SessionToCreate,
} from '../session-port.ts'
import type { ReportWaits, WaitOutcome } from '../wait-port.ts'

export const tenantOf = (name: string) => `tenant-${name}` as TenantId
export const sessionNamed = (name: string) => `session-${name}` as SessionRef

/** A clock a test moves by hand. Every reading is one millisecond later than the one before. */
export function fakeClock(start = Date.parse('2026-11-20T00:00:00.000Z')): Clock {
  let now = start
  return { now: () => new Date(now++).toISOString() as Instant }
}

export type FakeAuthority = DispatchAuthority &
  Readonly<{
    asked: readonly Readonly<{ ctx: CallContext; action: AuthorityAction }>[]
    answer(action: AuthorityAction, answer: AuthorityAnswer | 'throws'): void
  }>

export function fakeAuthority(): FakeAuthority {
  const asked: { ctx: CallContext; action: AuthorityAction }[] = []
  const answers = new Map<AuthorityAction, AuthorityAnswer | 'throws'>()
  return {
    asked,
    answer: (action, answer) => void answers.set(action, answer),
    async decide(ctx, action) {
      asked.push({ ctx, action })
      const answer = answers.get(action) ?? 'permitted'
      if (answer === 'throws') throw new Error('the authority is down')
      return answer
    },
  }
}

type Sent = InputToSend & Readonly<{ tenant: TenantId }>

export type FakeSessions = DispatchSessions &
  Readonly<{
    seat(tenant: TenantId, row: Partial<SessionRow> & Pick<SessionRow, 'session'>): void
    archive(tenant: TenantId, session: SessionRef): void
    remove(tenant: TenantId, session: SessionRef): void
    created: readonly Readonly<{ tenant: TenantId; creation: SessionToCreate }>[]
    sent: readonly Sent[]
    cancelled: readonly SessionRef[]
    /** The next creation answers this instead of creating. `unknown-created` creates and answers unknown. */
    createNext(answer: 'failed' | 'unknown' | 'unknown-created'): void
    /** The next send answers this; `unknown-sent` also puts the input in the session. `readable(false, only)` fails one kind of read. */
    sendNext(answer: 'unknown' | 'unknown-sent' | 'refused'): void
    counts(): Readonly<{ sends: number; looks: number }>
    /** Where the starting input of a created session is. */
    fate(session: SessionRef, fate: InputFate): void
    cancelAnswers(answer: CancelAnswer): void
    readable(on: boolean, only?: 'rows' | 'looks'): void
  }>

const key = (tenant: TenantId, session: SessionRef) => JSON.stringify([tenant, session])

export function fakeSessions(): FakeSessions {
  const rows = new Map<string, SessionRow>()
  const inputs = new Map<string, Set<string>>()
  const fates = new Map<SessionRef, InputFate>()
  const created: { tenant: TenantId; creation: SessionToCreate }[] = []
  const sent: Sent[] = []
  const cancelled: SessionRef[] = []
  let nextCreate: 'failed' | 'unknown' | 'unknown-created' | null = null
  let nextSend: 'unknown' | 'unknown-sent' | 'refused' | null = null
  const counted = { sends: 0, looks: 0 }
  let cancelAnswer: CancelAnswer = 'stopped'
  const off = new Set<'rows' | 'looks' | 'fates'>()
  const read = <T>(what: 'rows' | 'looks' | 'fates', value: T) =>
    off.has(what) ? ({ kind: 'unavailable' } as const) : ({ kind: 'read', value } as const)

  function seat(tenant: TenantId, row: Partial<SessionRow> & Pick<SessionRow, 'session'>): void {
    rows.set(key(tenant, row.session), {
      depth: 0,
      archived: false,
      agent: 'coding',
      permission: 'auto_permission',
      ...row,
    })
  }

  function make(tenant: TenantId, creation: SessionToCreate): void {
    const known = created.some(item => item.creation.session === creation.session)
    if (known) return
    created.push({ tenant, creation })
    const parent = rows.get(key(tenant, creation.dispatch.dispatcher))
    const handoff = creation.dispatch.mode === 'handoff'
    seat(tenant, {
      session: creation.session,
      depth: handoff ? 0 : (parent?.depth ?? 0) + 1,
      agent: creation.dispatch.agent,
      permission: creation.permission,
    })
    fates.set(creation.session, { kind: 'running' })
  }

  return {
    seat,
    archive: (tenant, session) => {
      const row = rows.get(key(tenant, session))
      if (row !== undefined) rows.set(key(tenant, session), { ...row, archived: true })
    },
    remove: (tenant, session) => void rows.delete(key(tenant, session)),
    created,
    sent,
    cancelled,
    createNext: answer => void (nextCreate = answer),
    sendNext: answer => void (nextSend = answer),
    counts: () => ({ ...counted }),
    fate: (session, fate) => void fates.set(session, fate),
    cancelAnswers: answer => void (cancelAnswer = answer),
    readable(on, only) {
      for (const what of only === undefined ? (['rows', 'looks', 'fates'] as const) : [only])
        if (on) off.delete(what)
        else off.add(what)
    },
    sessionOf: (tenant, dispatch: DispatchId) =>
      createHash('sha256')
        .update(JSON.stringify([tenant, dispatch]))
        .digest('hex') as SessionRef,
    row: async (tenant, session) => read('rows', rows.get(key(tenant, session)) ?? null),
    async create(tenant, creation): Promise<CreateAnswer> {
      const answer = nextCreate
      nextCreate = null
      if (answer === 'failed') return { kind: 'failed', detail: 'the session could not be created' }
      if (answer === 'unknown') return { kind: 'unknown' }
      make(tenant, creation)
      return answer === 'unknown-created' ? { kind: 'unknown' } : { kind: 'created' }
    },
    startFate: async (_tenant, { session }) =>
      read('fates', fates.get(session) ?? { kind: 'absent' }),
    async send(tenant, input): Promise<SendAnswer> {
      counted.sends += 1
      const row = rows.get(key(tenant, input.to))
      if (row === undefined) return { kind: 'refused', reason: 'no-such-session' }
      if (row.archived) return { kind: 'refused', reason: 'archived' }
      const answer = nextSend
      nextSend = null
      if (answer === 'unknown') return { kind: 'unknown' }
      if (answer === 'refused') return { kind: 'refused', reason: 'archived' }
      const held = inputs.get(key(tenant, input.to)) ?? new Set()
      inputs.set(key(tenant, input.to), held)
      if (!held.has(input.input)) sent.push({ ...input, tenant })
      held.add(input.input)
      return answer === 'unknown-sent' ? { kind: 'unknown' } : { kind: 'sent' }
    },
    async has(tenant, session, input) {
      counted.looks += 1
      return read('looks', inputs.get(key(tenant, session))?.has(input) ?? false)
    },
    async cancelStart(_tenant, { session }) {
      cancelled.push(session)
      return cancelAnswer
    },
  }
}

export type FakeWaits = ReportWaits &
  Readonly<{
    /** What the wait of a call is: open until a test closes it or an outcome is handed to it. */
    close(call: string): void
    unreadable(on: boolean): void
    answers: ReadonlyMap<string, WaitOutcome>
    handed: readonly Readonly<{ call: string; outcome: WaitOutcome }>[]
  }>

/** The wait of each dispatching call, with the one commit of Tool that decides open against closed. */
export function fakeWaits(): FakeWaits {
  const closed = new Set<string>()
  const answers = new Map<string, WaitOutcome>()
  const handed: { call: string; outcome: WaitOutcome }[] = []
  let broken = false
  return {
    close: call => void closed.add(call),
    unreadable: on => void (broken = on),
    answers,
    handed,
    async hand(_tenant, dispatch, outcome): Promise<WaitAnswer> {
      handed.push({ call: dispatch.call, outcome })
      if (broken) return 'unreadable'
      const answered = answers.get(dispatch.call)
      if (answered !== undefined) return answered.id === outcome.id ? 'delivered' : 'closed'
      if (closed.has(dispatch.call)) return 'closed'
      answers.set(dispatch.call, outcome)
      return 'delivered'
    },
  }
}

export function fakeDefinitions(
  known: Readonly<Record<string, 'master' | 'non-master'>> = {
    coding: 'master',
    helper: 'non-master',
  },
): AgentDefinitions & Readonly<{ readable(on: boolean): void }> {
  let canRead = true
  return {
    readable: on => void (canRead = on),
    typeOf: async (_tenant, name) =>
      canRead ? { kind: 'read', value: known[name] ?? null } : { kind: 'unavailable' },
  }
}

type CopyAnswer = ContextMoment | 'unreadable'

export function fakeCopies(): ContextCopies &
  Readonly<{ answer(next: CopyAnswer): void; asked: readonly (readonly string[])[] }> {
  let next: CopyAnswer = { kind: 'moment', moment: 'moment-1' }
  const asked: string[][] = []
  return {
    asked,
    answer: given => void (next = given),
    moment: async (tenant, dispatcher, call) => {
      asked.push([tenant, dispatcher, call])
      return next === 'unreadable' ? { kind: 'unavailable' } : { kind: 'read', value: next }
    },
  }
}
