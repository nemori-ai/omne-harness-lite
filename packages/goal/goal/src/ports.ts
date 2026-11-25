import type { AnsweredCard, Attendance, GoalCaller, Wake } from '@omne-harness/goal-contract'

export type GoalAction =
  | 'read'
  | 'propose'
  | 'confirm'
  | 'track'
  | 'set'
  | 'revise'
  | 'pause'
  | 'resume'
  | 'cancel'
  | 'abort'
  | 'settle-by-exit'
export type AuthorityAnswer = 'permitted' | 'denied' | 'unavailable'

export interface GoalAuthority {
  /** Whether this caller may do this to the goal of this session now. Asked on every operation, never cached. */
  decide(caller: GoalCaller, session: string, action: GoalAction): Promise<AuthorityAnswer>
}

/** Asks the authority; a failure to answer is `unavailable`, never an allowance. */
export async function ask(
  authority: GoalAuthority,
  caller: GoalCaller,
  session: string,
  action: GoalAction,
): Promise<AuthorityAnswer> {
  try {
    return await authority.decide(caller, session, action)
  } catch {
    return 'unavailable'
  }
}

export type PortRead<T> = Readonly<{ kind: 'read'; value: T }> | Readonly<{ kind: 'unavailable' }>

export type SessionFacts = Readonly<{ attendance: Attendance }>
export type WakeToSend = Wake & Readonly<{ session: string; rendered: string }>
/** `refused`: the session takes no input any more. `unknown`: sent or not, nobody can tell. */
export type SendAnswer = 'sent' | 'refused' | 'unknown'

export interface GoalSessions {
  facts(tenant: string, session: string): Promise<PortRead<SessionFacts | null>>
  /** Sends the reminder a change owes its session. The same request is taken by the session once. */
  wake(tenant: string, wake: WakeToSend): Promise<SendAnswer>
}

export interface GoalCards {
  /** A card of this session as its owner holds it answered, or null when it holds no such answered card. */
  answered(tenant: string, session: string, card: string): Promise<PortRead<AnsweredCard | null>>
}

export interface GoalCalls {
  /** Of these references, the ones that name a tool call of this session made since that moment. */
  cited(
    tenant: string,
    session: string,
    refs: readonly string[],
    since: string,
  ): Promise<PortRead<readonly string[]>>
}

export interface Clock {
  now(): string
}

/** A wake-up. It may come early, late, twice or never: the store holds what is owed. */
export interface ReconcileHints {
  wake(tenant: string): void
}
