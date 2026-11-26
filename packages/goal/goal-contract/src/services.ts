import type { ExitId } from './body.ts'
import type { CardBase, CardRefusal, GoalRecord } from './record.ts'
import type { Refusal } from './transition.ts'
import type { BodyIssue } from './validate.ts'

export type Outcome<T, R> =
  | Readonly<{ kind: 'done'; value: T; recalled: boolean }>
  | Readonly<{ kind: 'refused'; reason: R }>
  | Readonly<{ kind: 'basis-unavailable' }>
  | Readonly<{ kind: 'unknown' }>

export type GoalCaller = Readonly<{ tenant: string; subject: unknown }>

export type Proposal =
  | Readonly<{ kind: 'set'; draft: unknown }>
  | Readonly<{ kind: 'revise'; changes: unknown }>

export type GoalRefusal =
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'no-such-session' }>
  | Readonly<{ kind: 'no-such-card' }>
  | Readonly<{ kind: 'invalid'; issues: readonly BodyIssue[] }>
  | Readonly<{ kind: 'state'; reason: Refusal }>
  | Readonly<{ kind: 'another-goal' }>
  | Readonly<{ kind: 'card'; reason: CardRefusal }>
  | Readonly<{ kind: 'differs' }>

export type GoalCommand =
  | Readonly<{ kind: 'pause' | 'resume' | 'cancel' | 'abort' }>
  | Readonly<{ kind: 'settle-by-exit'; exit: ExitId }>

/** What a confirmation card of this proposal shows and is drafted against. Nothing is written by proposing. */
export type Proposed = Readonly<{
  kind: Proposal['kind']
  rendered: string
  digest: string
  base: CardBase
  /** What a revision changes, by number; `purpose` and `method` by name. Empty for a new goal. */
  changed: readonly string[]
}>

export type DirectWrite = Readonly<{
  session: string
  operation: string
  proposal: Proposal
  words: string | null
  draftedBy: 'person' | 'creator'
  by: string
}>

export type Check = Readonly<{ session: string; call: string; candidate: 'complete' | 'failed' }>
export type CheckAnswer =
  | Readonly<{ kind: 'pass' }>
  | Readonly<{ kind: 'continue' }>
  | Readonly<{ kind: 'tell'; note: string }>

export interface Goals {
  /** The goal of this session as it stands, or null when it never had one. */
  read(caller: GoalCaller, session: string): Promise<Outcome<GoalRecord | null, GoalRefusal>>
  write(caller: GoalCaller, input: DirectWrite): Promise<Outcome<GoalRecord, GoalRefusal>>
  command(
    caller: GoalCaller,
    input: Readonly<{ session: string; command: GoalCommand; generation?: number }>,
  ): Promise<Outcome<GoalRecord | null, GoalRefusal>>
  propose(
    caller: GoalCaller,
    input: Readonly<{ session: string; proposal: Proposal }>,
  ): Promise<Outcome<Proposed, GoalRefusal>>
  /** Writes the proposal on the standing of an answered card. The card is read from its owner, not taken from the caller. */
  confirm(
    caller: GoalCaller,
    input: Readonly<{ session: string; card: string; proposal: Proposal }>,
  ): Promise<Outcome<GoalRecord, GoalRefusal>>
  /** Updates the progress list of the live goal. It changes what the agent says, never the state of the goal. */
  track(
    caller: GoalCaller,
    input: Readonly<{ session: string; patch: unknown }>,
  ): Promise<Outcome<GoalRecord, GoalRefusal>>
  brief(
    caller: GoalCaller,
    input: Readonly<{ examiner: string }>,
  ): Promise<Outcome<string, GoalRefusal>>
  submit(
    caller: GoalCaller,
    input: Readonly<{ examiner: string; submission: unknown }>,
  ): Promise<Outcome<Taken, GoalRefusal>>
}
export type Taken = Readonly<{ taken: 'counted' | 'stale' | 'repeat' }>

export interface GoalChecking {
  observe(caller: GoalCaller, check: Check): Promise<Outcome<CheckAnswer, GoalRefusal>>
  compacted(caller: GoalCaller, session: string): Promise<Outcome<string | null, GoalRefusal>>
}

export interface GoalReconciling {
  /** Hands over what a tenant's goals still owe their sessions. Safe to call at any time, any number of times. */
  reconcile(tenant: string): Promise<void>
}
