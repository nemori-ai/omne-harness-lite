import type { TenantId } from '@omne-harness/legal-identity'
import type { RejectedUpdate } from './reduce.js'
import type { ContextBlockKey, ScopeRef } from './shared.js'
import type { RegistrationRejection, JudgedRegistration } from './judge.js'
import type { ContextReader } from './reader.js'
import type { StepCommit } from './update.js'
import type {
  RegistrationChange,
  EligibilityId,
  Eligibility,
  EligibilityMaterial,
} from './registration.js'
import type { ProducerRegistration, ProducerHandle } from './producer.js'
import type { RegistrationRevision, ViewRevision, CommitRef } from './shared.js'
import type { CheckUnavailable, CheckUnknown } from './authority.js'
import type {
  BeginReplayInput,
  BeginReplayResult,
  FinishReplayInput,
  FinishReplayResult,
} from './replay.js'

export type RegisterProducerResult<K extends ContextBlockKey = ContextBlockKey> =
  | Readonly<{ kind: 'registered'; handle: ProducerHandle<K> }>
  | Readonly<{
      kind: 'rejected'
      reason: 'declaration-missing' | 'declaration-mismatch' | 'other-producer' | 'closed'
    }>
  | Readonly<{ kind: 'refused'; reason: 'unauthorized' }>
  | CheckUnavailable
  | CheckUnknown

export interface ProducerOperations<P = unknown> {
  registerProducer<K extends ContextBlockKey>(
    principal: P,
    registration: ProducerRegistration<K, P>,
  ): Promise<RegisterProducerResult<K>>
}

export type PrepareRegistrationResult =
  | Readonly<{
      kind: 'prepared'
      judged: JudgedRegistration
      currentRevision: RegistrationRevision
    }>
  | Readonly<{ kind: 'rejected'; rejections: readonly RegistrationRejection[] }>
  | Readonly<{
      kind: 'refused'
      reason: 'closed' | 'callerMismatch' | 'unauthorized' | 'scope-ended'
    }>
  | CheckUnavailable
  | CheckUnknown

export type IssueEligibilityResult<P = unknown> =
  | Readonly<{ kind: 'issued'; eligibility: Eligibility<P> }>
  | Readonly<{
      kind: 'refused'
      reason: 'unauthorized' | 'supersedes-unknown' | 'closed' | 'scope-ended' | 'replay-incomplete'
    }>
  | CheckUnavailable
  | CheckUnknown

export type RevokeEligibilityResult =
  | Readonly<{ kind: 'revoked' }>
  | Readonly<{
      kind: 'refused'
      reason: 'unknown-eligibility' | 'closed' | 'callerMismatch' | 'unauthorized'
    }>
  | CheckUnavailable
  | CheckUnknown

export type CommitInput =
  | Readonly<{
      kind: 'registration'
      commit: CommitRef
      after: CommitRef | null
      change: RegistrationChange
      scopeEnded?: true
    }>
  | Readonly<{
      kind: 'step'
      commit: CommitRef
      after: CommitRef | null
      tenant: TenantId
      stepCommit: StepCommit
      executionEnded: boolean
      scopeEnded?: true
    }>
  | Readonly<{
      kind: 'scope'
      commit: CommitRef
      scope: ScopeRef
      tenant: TenantId
      scopeEnded: true
    }>

export type ApplyCommitResult =
  | Readonly<{
      kind: 'applied'
      registrationRevision: RegistrationRevision
      viewRevision: ViewRevision
    }>
  | Readonly<{
      kind: 'invalid'
      reason:
        | 'out-of-order'
        | 'commit-conflict'
        | 'tenant-mismatch'
        | 'registration'
        | 'rejected-update'
        | 'malformed-input'
      current: RegistrationRevision
      rejections?: readonly RegistrationRejection[]
      rejected?: readonly RejectedUpdate[]
    }>
  | Readonly<{
      kind: 'refused'
      reason: 'unauthorized' | 'closed' | 'callerMismatch' | 'scope-ended' | 'replay-incomplete'
    }>
  | CheckUnavailable
  | CheckUnknown

export interface HolderOperations<P = unknown> {
  prepareRegistration(principal: P, change: RegistrationChange): Promise<PrepareRegistrationResult>
  issueEligibility(
    principal: P,
    material: EligibilityMaterial<P>,
  ): Promise<IssueEligibilityResult<P>>
  revokeEligibility(principal: P, id: EligibilityId): Promise<RevokeEligibilityResult>
  applyCommit(principal: P, input: CommitInput): Promise<ApplyCommitResult>
  beginReplay(principal: P, input: BeginReplayInput): Promise<BeginReplayResult>
  finishReplay(principal: P, input: FinishReplayInput): Promise<FinishReplayResult>
}

export type BindResult =
  | Readonly<{ kind: 'bound'; reader: ContextReader }>
  | Readonly<{
      kind: 'refused'
      reason: 'unauthorized' | 'closed' | 'callerMismatch' | 'scope-ended' | 'replay-incomplete'
    }>
  | Readonly<{
      kind: 'unknown'
      cause: 'eligibility-unknown' | 'scope-binding-unknown' | 'replay-unknown'
    }>

export interface ReaderOperations {
  bind(eligibility: EligibilityId): Promise<BindResult>
}

export type RuntimeContextOperations<P = unknown> = ProducerOperations<P> &
  HolderOperations<P> &
  ReaderOperations
