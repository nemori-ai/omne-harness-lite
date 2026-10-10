import type { AtomicStorage, StorageUnit } from '@omne-harness-lite/storage'
import type { JsonNumber } from '@omne-harness-lite/content-blocks'
import type {
  CheckedPrefix,
  LogAuthority,
  SessionLogParticipant,
} from '@omne-harness-lite/session-log'
import type { ExecutionOrigin, ExecutionRef } from './tool-execution.ts'
import type { TenantId } from '@omne-harness-lite/identity-values'
import type { ToolPoolInstance } from './execution-pool.ts'
import type { ToolRuntimeConfig, ToolRuntimeDependencies } from './runtime-provider.ts'

/** The generation distinguishes owners, not additional executions of the same call. */
export interface ToolOriginalIssueIdentity {
  readonly ref: ExecutionRef
  readonly origin: ExecutionOrigin
  readonly adoption: string
  readonly executionGeneration: string
  /** The native intended-entry key, not the Session prepare position. */
  readonly originalPosition: string
}
declare const toolIssueClaimBrand: unique symbol
export interface ToolOriginalIssueClaim {
  readonly [toolIssueClaimBrand]: true
}
export type ToolOriginalIssueFailure = {
  readonly kind:
    | 'invalidInput'
    | 'denied'
    | 'staleAttempt'
    | 'terminal'
    | 'closed'
    | 'unavailable'
    | 'conflict'
    | 'retryFromFacts'
}
export type ToolOriginalIssueStage =
  | {
      readonly kind: 'staged'
      readonly identity: ToolOriginalIssueIdentity
      readonly claim: ToolOriginalIssueClaim
      readonly positions: readonly JsonNumber[]
    }
  | { readonly kind: 'alreadyIssued'; readonly identity: ToolOriginalIssueIdentity }
  | ToolOriginalIssueFailure
export type ToolOriginalIssueConsumeStage =
  | { readonly kind: 'staged'; readonly identity: ToolOriginalIssueIdentity }
  | { readonly kind: 'alreadyConsumed'; readonly identity: ToolOriginalIssueIdentity }
  | ToolOriginalIssueFailure

/** Produced by the original native owner after it retains the complete intended job. */
export interface ToolOriginalIssueParticipant {
  readonly identity: ToolOriginalIssueIdentity
  readonly expected: Pick<CheckedPrefix, 'ownerGeneration' | 'tail'>
  /** Actual original job stop and borrow return, independent of result or admission completion. */
  readonly stopped: Promise<void>
  readonly stageOriginalIn: (unit: StorageUnit) => Promise<ToolOriginalIssueStage>
  /** Stages consumption only. No author call or resource release occurs in the unit. */
  readonly consumeOriginalIn: (
    unit: StorageUnit,
    claim: ToolOriginalIssueClaim,
  ) => Promise<ToolOriginalIssueConsumeStage>
}
export type ToolOriginalIssueUnknown = {
  readonly kind: 'unknownCommit'
  readonly identity: ToolOriginalIssueIdentity
}

/** Trusted Session construction. Neither operation accepts authority from submit body data. */
export interface ToolOriginalIssueAdmission {
  readonly admitOriginal: (participant: ToolOriginalIssueParticipant) => Promise<
    | {
        readonly kind: 'issued'
        readonly identity: ToolOriginalIssueIdentity
        readonly claim: ToolOriginalIssueClaim
        readonly positions: readonly JsonNumber[]
      }
    | { readonly kind: 'alreadyIssued'; readonly identity: ToolOriginalIssueIdentity }
    | ToolOriginalIssueUnknown
    | ToolOriginalIssueFailure
  >
  /** Returns launch only after actual commit of original consumption and current checks. */
  readonly consumeOriginal: (
    claim: ToolOriginalIssueClaim,
  ) => Promise<
    | { readonly kind: 'launch'; readonly identity: ToolOriginalIssueIdentity }
    | { readonly kind: 'alreadyConsumed'; readonly identity: ToolOriginalIssueIdentity }
    | ToolOriginalIssueUnknown
    | ToolOriginalIssueFailure
  >
}

/** Same-unit current qualification. This protocol does not replace native Tool guards. */
export interface ToolOriginalIssueAuthority {
  readonly authorizeIn: (
    unit: StorageUnit,
    identity: ToolOriginalIssueIdentity,
  ) => Promise<{ readonly kind: 'authorized' } | ToolOriginalIssueFailure>
}

/** The root must pair these resources with the same native runtime and Session storage. */
export interface ToolOriginalIssueSupport {
  readonly storage: AtomicStorage
  readonly log: Pick<SessionLogParticipant, 'sourceIn' | 'readByKeyIn' | 'appendIn'>
  readonly access: LogAuthority
  readonly current: ToolOriginalIssueAuthority
  readonly admission: ToolOriginalIssueAdmission
  /** Session classifies the original against its facts in the terminal's actual commit unit. */
  readonly classifyTerminalIn: (
    unit: StorageUnit,
    identity: ToolOriginalIssueIdentity,
  ) => Promise<{ readonly kind: 'classified'; readonly late: boolean } | ToolOriginalIssueFailure>
}
/** Required construction subset for a Tool instance used by the Session driver. */
export interface ToolRuntimeOriginalIssueDependencies extends ToolRuntimeDependencies {
  readonly tenant: TenantId
  readonly recoveryPageSize: number
  readonly originalIssue: ToolOriginalIssueSupport
}

/** Required behavior is supplied by the selected implementation, never inferred from assignability. */
export interface ToolRuntimeOriginalIssueFactory {
  readonly create: (
    config: ToolRuntimeConfig,
    dependencies: ToolRuntimeOriginalIssueDependencies,
  ) => ToolPoolInstance
}
