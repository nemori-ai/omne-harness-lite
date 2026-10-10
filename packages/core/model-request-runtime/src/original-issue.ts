import type { StorageUnit } from '@omne-harness-lite/storage'
import type { OwnedLogEntry, SourceToken } from '@omne-harness-lite/session-log'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { JsonNumber } from '@omne-harness-lite/content-blocks'
import type { ModelExecutionJob } from './execution-pool.ts'
/** The original model owner captures the exact prepared dispatched record and fixed source. */
export interface OriginalIssueInput {
  readonly source: SourceToken
  readonly originalPosition: string
  readonly entry: OwnedLogEntry
}
declare const claimBrand: unique symbol
export interface OriginalIssueClaim {
  readonly [claimBrand]: true
}
export interface OriginalIssueIdentity extends SessionScope {
  readonly call: string
  readonly dispatch: JsonNumber
  readonly run?: string
  readonly attempt?: JsonNumber
  readonly executionGeneration: string
  readonly originalPosition: string
}
export type OriginalIssueFailure = {
  readonly kind: 'invalidInput' | 'denied' | 'staleAttempt' | 'unavailable' | 'conflict'
}
export type OriginalIssueStage =
  | {
      readonly kind: 'staged'
      readonly claim: OriginalIssueClaim
      readonly identity: OriginalIssueIdentity
      readonly positions: readonly JsonNumber[]
    }
  | { readonly kind: 'alreadyIssued'; readonly identity: OriginalIssueIdentity }
  | OriginalIssueFailure
export interface OriginalIssueParticipant {
  readonly stageOriginalIn: (
    unit: StorageUnit,
    job: ModelExecutionJob,
  ) => Promise<OriginalIssueStage>
}
/** This is a same-unit current source. Neither a job nor a claim grants authorization. */
export interface OriginalIssueAuthority {
  readonly authorizeIn: (
    unit: StorageUnit,
    identity: OriginalIssueIdentity,
  ) => Promise<{ readonly kind: 'authorized' } | OriginalIssueFailure>
}

/** Model-owned admission. A recognized original claim never grants another launch. */
export interface OriginalIssueAdmission {
  readonly admitOriginal: (input: OriginalIssueInput) => Promise<
    | {
        readonly confirmed: true
        readonly positions: readonly JsonNumber[]
        readonly claim: OriginalIssueClaim
      }
    | OriginalIssueFailure
  >
  readonly consumeOriginal: (
    claim: OriginalIssueClaim,
  ) => Promise<{ readonly kind: 'launch' } | OriginalIssueFailure>
}

/** Native original owner selected by the trusted root. It does not own the physical model pool. */
export interface OriginalIssueOwner extends OriginalIssueAdmission {
  readonly participant: OriginalIssueParticipant
  readonly prepareOriginal: (
    input: OriginalIssueInput,
  ) => { readonly job: ModelExecutionJob } | OriginalIssueFailure
  readonly close: () => Promise<{ readonly kind: 'released' } | { readonly kind: 'pending' }>
}
