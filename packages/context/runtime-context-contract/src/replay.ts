import type { TenantId } from '@omne-harness/legal-identity'
import type { RejectedUpdate } from './reduce.js'
import type { RegistrationRejection } from './judge.js'
import type {
  ScopeRef,
  ContextBlockKey,
  CommitRef,
  StepRef,
  RegistrationRevision,
  ViewRevision,
} from './shared.js'
import type { RegistrationChange } from './registration.js'
import type { CheckUnavailable, CheckUnknown } from './authority.js'

export type ReplayRef = Readonly<{ replay: string }>

export type BeginReplayInput = Readonly<{
  scope: ScopeRef
  tenant: TenantId
  through: CommitRef | null
  supersedes: ReplayRef | null
}>

export type ReplayBlock = Readonly<{ key: ContextBlockKey; value: unknown; updates: readonly [] }>

export type ReplayMaterial = Readonly<{
  registrations: readonly Readonly<{ commit: CommitRef; change: RegistrationChange }>[]
  checkpoints: readonly Readonly<{
    commit: CommitRef
    step: StepRef
    blocks: readonly ReplayBlock[]
  }>[]
  end: Readonly<{ commit: CommitRef }> | null
}>

export type FinishReplayInput = Readonly<{ replay: ReplayRef; material: ReplayMaterial }>

export type ReplayPrevious = Readonly<{
  checkpoint: CommitRef | null
  registrationRevision: RegistrationRevision
  end: CommitRef | null
}>

export type AppliedCommit = Readonly<{ commit: CommitRef; digest: string }>

export type BeginReplayResult =
  | Readonly<{ kind: 'replaying'; replay: ReplayRef }>
  | Readonly<{
      kind: 'invalid'
      reason: 'checkpoint-conflict' | 'replay-conflict' | 'malformed-input'
    }>
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
