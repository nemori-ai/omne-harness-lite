import type {
  AnsweredCard,
  Criterion,
  GoalCaller,
  JudgeConfig,
  JudgeReply,
  JudgeRequest,
  ObservedCall,
} from '@omne-harness/goal-contract'

export type GoalAction =
  | 'read'
  | 'propose'
  | 'confirm'
  | 'track'
  | 'observe'
  | 'brief'
  | 'submit'
  | 'rerun'
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

export type BatchToHand = Readonly<{
  session: string
  request: string
  examiner: string | null
  brief: string
  criteria: readonly Readonly<{ id: string; evidence: Criterion['evidence'] }>[]
}>
export type HandAnswer =
  | Readonly<{ kind: 'handed'; examiner: string }>
  | Readonly<{ kind: 'taking' }>
  | Readonly<{ kind: 'unknown' }>
  | Readonly<{ kind: 'refused' }>

export interface GoalExamining {
  hand(tenant: string, batch: BatchToHand): Promise<HandAnswer>
  cited(
    tenant: string,
    examiner: string,
    request: string,
    refs: readonly string[],
  ): Promise<PortRead<readonly string[]>>
}

export interface GoalHistory {
  calls(tenant: string, session: string, since: string): Promise<PortRead<readonly ObservedCall[]>>
  /** What the agent last said since that moment, when it said it after its last tool call; null when it said nothing. */
  said(tenant: string, session: string, since: string): Promise<PortRead<string | null>>
}

export type DecisionAsk = Readonly<{
  caller: GoalCaller
  session: string
  identity: string
  model: string
  request: JudgeRequest
}>

export interface GoalDecisions {
  ask(input: DecisionAsk): Promise<JudgeReply>
}

export interface GoalJudging {
  config(tenant: string, session: string): Promise<PortRead<JudgeConfig>>
}

export interface Clock {
  now(): string
}

/** Told after a write of a session's goal stood. Whoever listens reads the goal again: nothing of it is carried here. */
export interface GoalChanges {
  changed(tenant: string, session: string): void
}

export interface ReconcileHints {
  wake(tenant: string): void
}
