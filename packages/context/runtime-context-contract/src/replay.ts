import type { TenantId } from '@omne-harness/legal-identity'
import type { RejectedUpdate } from './reduce.js'
import type { RegistrationRejection } from './judge.js'
import type { ScopeRef, ContextBlockKey, CommitRef, StepRef, RegistrationRevision, ViewRevision } from './shared.js'
import type { RegistrationChange } from './registration.js'
import type { CheckUnavailable, CheckUnknown } from './authority.js'

/** Minted by the instance; bound to one scope, tenant and replay epoch. Not a credential (RC-09). */
export type ReplayRef = Readonly<{ replay: string }>

/** Starts or supersedes the replay session of one scope on this instance. */
export type BeginReplayInput = Readonly<{
  scope: ScopeRef
  tenant: TenantId
  /** The holder's durable checkpoint; null only for an empty scope. */
  through: CommitRef | null
  supersedes: ReplayRef | null
}>

/** One checkpointed stateful block with the full value of its latest step commit; no updates. */
export type ReplayBlock = Readonly<{ key: ContextBlockKey; value: unknown; updates: readonly [] }>

/**
 * The complete recovery material up to the checkpoint. It is not an ordinary request and does not
 * copy the holder's log type.
 */
export type ReplayMaterial = Readonly<{
  /** Every registration commit of the scope in durable order, removals included. */
  registrations: readonly Readonly<{ commit: CommitRef; change: RegistrationChange }>[]
  /** Each checkpointed block of the final registration exactly once, grouped by original commit and step. */
  checkpoints: readonly Readonly<{ commit: CommitRef; step: StepRef; blocks: readonly ReplayBlock[] }>[]
  /** The confirmed scope end up to the checkpoint, or null. */
  end: Readonly<{ commit: CommitRef }> | null
}>

export type FinishReplayInput = Readonly<{ replay: ReplayRef; material: ReplayMaterial }>

/** Filled in by the instance for the holder authority: the last checkpoint, revision and known end. */
export type ReplayPrevious = Readonly<{
  checkpoint: CommitRef | null
  registrationRevision: RegistrationRevision
  end: CommitRef | null
}>

/** One ordinary commit this instance applied, with a digest of its full canonical input. */
export type AppliedCommit = Readonly<{ commit: CommitRef; digest: string }>

export type BeginReplayResult =
  | Readonly<{ kind: 'replaying'; replay: ReplayRef }>
  | Readonly<{ kind: 'invalid'; reason: 'checkpoint-conflict' | 'replay-conflict' | 'malformed-input' }>
  | Readonly<{ kind: 'refused'; reason: 'unauthorized' | 'closed' | 'callerMismatch' }>
  | CheckUnavailable
  | CheckUnknown

export type FinishReplayResult =
  | Readonly<{
      kind: 'ready'
      state: 'open' | 'ended'
      registrationRevision: RegistrationRevision
      viewRevision: ViewRevision
    }>
  | Readonly<{
      kind: 'invalid'
      reason:
        | 'replay-incomplete'
        | 'checkpoint-conflict'
        | 'replay-conflict'
        | 'registration'
        | 'rejected-update'
        | 'malformed-input'
      rejections?: readonly RegistrationRejection[]
      rejected?: readonly RejectedUpdate[]
    }>
  | Readonly<{ kind: 'refused'; reason: 'unauthorized' | 'closed' | 'callerMismatch' }>
  | CheckUnavailable
  | CheckUnknown
