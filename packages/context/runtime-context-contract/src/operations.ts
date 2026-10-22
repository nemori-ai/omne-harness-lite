import type { RejectedUpdate } from './reduce.js'
import type { ContextBlockKey } from './shared.js'
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

export type RegisterProducerResult<K extends ContextBlockKey = ContextBlockKey> =
  | Readonly<{ kind: 'registered'; handle: ProducerHandle<K> }>
  | Readonly<{
      kind: 'rejected'
      reason:
        | 'declaration-missing' // 没有带块声明（RC-07）
        | 'declaration-mismatch' // 与目录里同键的声明摘要不同（RC-02）
        | 'other-producer' // 同一块键已有另一身份的登记（RC-07）
        | 'closed'
    }>

export interface ProducerOperations {
  registerProducer<K extends ContextBlockKey>(
    registration: ProducerRegistration<K>,
  ): Promise<RegisterProducerResult<K>>
}

export type PrepareRegistrationResult =
  | Readonly<{
      kind: 'prepared'
      judged: JudgedRegistration
      currentRevision: RegistrationRevision
    }>
  | Readonly<{ kind: 'rejected'; rejections: readonly RegistrationRejection[] }>
  | Readonly<{ kind: 'refused'; reason: 'closed' | 'callerMismatch' }>

export type IssueEligibilityResult<P = unknown> =
  | Readonly<{ kind: 'issued'; eligibility: Eligibility<P> }>
  | Readonly<{
      kind: 'refused'
      reason:
        | 'unauthorized' // 块键集合里有块不允许该消费者类；需要绑定集合里有绑定不带翻译或需要的类不等于资格的类（RC-06）
        | 'supersedes-unknown' // 取代的资格身份不存在或已撤销
        | 'closed'
    }>

export type RevokeEligibilityResult =
  | Readonly<{ kind: 'revoked' }>
  | Readonly<{ kind: 'refused'; reason: 'unknown-eligibility' | 'closed' | 'callerMismatch' }>

export type CommitInput =
  | Readonly<{ kind: 'registration'; commit: CommitRef; change: RegistrationChange }>
  | Readonly<{
      kind: 'step'
      commit: CommitRef
      stepCommit: StepCommit
      /** The execution has ended: `untracked` stateful blocks of the scope become invalid (RC-05). */
      executionEnded: boolean
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
        | 'out-of-order' // 依据的注册修订不等于当前且提交身份未见过（带当前修订）
        | 'commit-conflict' // 同一提交身份配上不同变更
        | 'tenant-mismatch' // 作用域所属租户与第一次记下的不同
        | 'registration' // judgeRegistration 的拒绝（带逐项）
        | 'rejected-update' // 步提交含 reduceStep 拒绝的更新
      current: RegistrationRevision
      rejections?: readonly RegistrationRejection[]
      rejected?: readonly RejectedUpdate[]
    }>
  | Readonly<{ kind: 'refused'; reason: 'unauthorized' | 'closed' | 'callerMismatch' }>

export interface HolderOperations<P = unknown> {
  prepareRegistration(change: RegistrationChange): Promise<PrepareRegistrationResult>
  issueEligibility(material: EligibilityMaterial<P>): Promise<IssueEligibilityResult<P>>
  revokeEligibility(id: EligibilityId): Promise<RevokeEligibilityResult>
  applyCommit(input: CommitInput): Promise<ApplyCommitResult>
}

export type BindResult =
  | Readonly<{ kind: 'bound'; reader: ContextReader }>
  /** Unknown or revoked eligibility, or (over Cordis) a consumer class that does not match the intercept configuration. */
  | Readonly<{ kind: 'refused'; reason: 'unauthorized' | 'closed' | 'callerMismatch' }>

export interface ReaderOperations {
  bind(eligibility: EligibilityId): Promise<BindResult>
}

export type RuntimeContextOperations<P = unknown> = ProducerOperations &
  HolderOperations<P> &
  ReaderOperations
