import type { PendingModelResponse } from '@omne-harness-lite/model-response'
import type { ResultReceipt, CoordinationAuthority } from '@omne-harness-lite/session-runtime'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { SourceToken } from '@omne-harness-lite/session-log'
import type { StorageUnit } from '@omne-harness-lite/storage'
import type { OriginalIssueIdentity } from '@omne-harness-lite/model-request-runtime'

/** Trusted original execution source. A verified result also retains every required reference. */
export interface ModelResultSource {
  readonly verifyIn: (
    unit: StorageUnit,
    scope: SessionScope,
    original: OriginalIssueIdentity,
    pending: PendingModelResponse,
  ) => Promise<'verified' | 'invalidSource' | 'unavailable'>
}
export interface ModelResultInput {
  readonly resultKey: string
  readonly source: SourceToken
  readonly pending: PendingModelResponse
}
export interface ModelResultWitness {
  readonly original: OriginalIssueIdentity
  readonly response: string
  readonly semanticDigest: string
  readonly receipt: ResultReceipt
}
export type ModelResultStored = {
  readonly kind: 'custodied' | 'alreadyCustodied'
  readonly pending: PendingModelResponse
  readonly witness: ModelResultWitness
}
export type ModelResultFailure = {
  readonly failure: 'invalidInput' | 'denied' | 'invalidSource' | 'identityConflict' | 'unavailable'
}
/** This custody face neither advances a Run nor determines a reply disposition or issues an ACK. */
export interface LocalModelResultCustody {
  readonly store: (
    authority: CoordinationAuthority,
    scope: SessionScope,
    input: ModelResultInput,
  ) => Promise<
    | ModelResultStored
    | ModelResultFailure
    | {
        readonly kind: 'unknownCommit'
        readonly scope: SessionScope
        readonly call: string
        readonly resultKey: string
      }
  >
  readonly read: (
    authority: CoordinationAuthority,
    scope: SessionScope,
    call: string,
    resultKey: string,
  ) => Promise<ModelResultStored | ModelResultFailure | { readonly kind: 'absent' }>
}
