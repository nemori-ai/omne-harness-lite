import type { ExitId } from './body.ts'
import type { CardBase, CardRefusal, GoalRecord } from './record.ts'
import type { Refusal } from './transition.ts'
import type { BodyIssue } from './validate.ts'

export type Outcome<T, R> =
  | Readonly<{ kind: 'done'; value: T; recalled: boolean }>
  | Readonly<{ kind: 'refused'; reason: R }>
  | Readonly<{ kind: 'basis-unavailable' }>
  | Readonly<{ kind: 'unknown' }>

/** Who calls. The subject is opaque here: the authority of the assembly judges it on every call. */
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
  | Readonly<{ kind: 'card'; reason: CardRefusal }>

export type GoalCommand =
  | Readonly<{ kind: 'pause' | 'resume' | 'cancel' | 'abort' }>
  | Readonly<{ kind: 'settle-by-exit'; exit: ExitId }>

/** What a confirmation card of this proposal shows and is drafted against. Nothing is written by proposing. */
export type Proposed = Readonly<{
  kind: Proposal['kind']
  rendered: string
  digest: string
  base: CardBase
}>

/** The direct way in: the owner of the session hands in a body or changes on its own standing. */
export type DirectWrite = Readonly<{
  session: string
  operation: string
  proposal: Proposal
  words: string | null
  draftedBy: 'person' | 'creator'
  by: string
}>

export interface Goals {
  /** The goal of this session as it stands, or null when it never had one. */
  read(caller: GoalCaller, session: string): Promise<Outcome<GoalRecord | null, GoalRefusal>>
  write(caller: GoalCaller, input: DirectWrite): Promise<Outcome<GoalRecord, GoalRefusal>>
  command(
    caller: GoalCaller,
    input: Readonly<{ session: string; command: GoalCommand }>,
  ): Promise<Outcome<GoalRecord | null, GoalRefusal>>
  propose(
    caller: GoalCaller,
    input: Readonly<{ session: string; proposal: Proposal }>,
  ): Promise<Outcome<Proposed, GoalRefusal>>
  /** Writes the proposal on the standing of an answered card. The card is read from its owner, not taken from the caller. */
  confirm(
    caller: GoalCaller,
    input: Readonly<{ session: string; card: string; proposal: Proposal; words: string | null }>,
  ): Promise<Outcome<GoalRecord, GoalRefusal>>
  /** Updates the progress list of the live goal. It changes what the agent says, never the state of the goal. */
  track(
    caller: GoalCaller,
    input: Readonly<{ session: string; patch: unknown }>,
  ): Promise<Outcome<GoalRecord, GoalRefusal>>
}

export interface GoalReconciling {
  /** Hands over what a tenant's goals still owe their sessions. Safe to call at any time, any number of times. */
  reconcile(tenant: string): Promise<void>
}
