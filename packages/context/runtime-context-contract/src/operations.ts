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
      reason:
        | 'declaration-missing' // 没有带块声明（RC-07）
        | 'declaration-mismatch' // 与目录里同键的声明摘要不同（RC-02）
        | 'other-producer' // 同一租户、同一块键已有另一身份的登记（RC-07）
        | 'closed'
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
      reason:
        | 'unauthorized' // 无权；或块键集合里有块不允许该消费者类、需要绑定不合（RC-06）
        | 'supersedes-unknown' // 取代的资格身份不存在或已撤销
        | 'closed'
        | 'scope-ended'
        | 'replay-incomplete'
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

/** The scope and tenant come from the change, the step commit plus `tenant`, or the input itself (RC-02). */
export type CommitInput =
  | Readonly<{
      kind: 'registration'
      commit: CommitRef
      change: RegistrationChange
      /** The same confirmed commit also ends the scope; applied atomically or not at all (RC-09). */
      scopeEnded?: true
    }>
  | Readonly<{
      kind: 'step'
      commit: CommitRef
      tenant: TenantId
      stepCommit: StepCommit
      /** The execution has ended: `untracked` stateful blocks of the scope become invalid (RC-05). */
      executionEnded: boolean
      scopeEnded?: true
    }>
  /** Ends the scope only; makes no empty registration and no false step (RC-09). */
  | Readonly<{ kind: 'scope'; commit: CommitRef; scope: ScopeRef; tenant: TenantId; scopeEnded: true }>

export type ApplyCommitResult =
  | Readonly<{
      kind: 'applied'
      registrationRevision: RegistrationRevision
      viewRevision: ViewRevision
    }>
  | Readonly<{
      kind: 'invalid'
      reason:
        | 'out-of-order' // 依据的注册修订不等于当前且提交身份未见过（带当前修订）
        | 'commit-conflict' // 同一提交身份配上不同完整输入
        | 'tenant-mismatch' // 本实例记下的租户与可信绑定冲突（内部一致性异常）
        | 'registration' // judgeRegistration 的拒绝（带逐项）
        | 'rejected-update' // 步提交含 reduceStep 拒绝的更新
        | 'malformed-input' // 输入不能合法捕获
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
  issueEligibility(principal: P, material: EligibilityMaterial<P>): Promise<IssueEligibilityResult<P>>
  revokeEligibility(principal: P, id: EligibilityId): Promise<RevokeEligibilityResult>
  applyCommit(principal: P, input: CommitInput): Promise<ApplyCommitResult>
  beginReplay(principal: P, input: BeginReplayInput): Promise<BeginReplayResult>
  finishReplay(principal: P, input: FinishReplayInput): Promise<FinishReplayResult>
}

export type BindResult =
  | Readonly<{ kind: 'bound'; reader: ContextReader }>
  /** Unknown, revoked or replay-invalidated eligibility, or (over Cordis) a consumer class that does not match the intercept configuration. */
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
