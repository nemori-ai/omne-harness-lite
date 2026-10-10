import type {
  ToolOriginalIssueIdentity,
  ToolTerminalRecord,
  ToolResultCustodyEvidence,
} from '@omne-harness-lite/tool-execution-runtime'
import type { ToolMessage } from '@omne-harness-lite/messages'
import type { JsonNumber } from '@omne-harness-lite/content-blocks'
import type {
  AttemptPermit,
  CoordinationAuthority,
  ResultReceipt,
} from '@omne-harness-lite/session-runtime'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { SourceToken } from '@omne-harness-lite/session-log'

export interface ToolResultInput {
  readonly resultKey: string
  readonly source: SourceToken
  readonly original: ToolOriginalIssueIdentity
  readonly terminal: ToolTerminalRecord
}
export interface ToolResultWitness {
  readonly original: ToolOriginalIssueIdentity
  readonly semanticDigest: string
  readonly receipt: ResultReceipt
}
export type ToolResultStored = {
  readonly kind: 'custodied' | 'alreadyCustodied'
  readonly result: ToolResultCustodyEvidence
  readonly witness: ToolResultWitness
}
export type ToolResultFailure = {
  readonly failure: 'invalidInput' | 'denied' | 'invalidSource' | 'identityConflict' | 'unavailable'
}
export interface ToolResultUnknown {
  readonly kind: 'unknownCommit'
  readonly scope: SessionScope
  readonly call: string
  readonly resultKey: string
}

/** Full original custody is independent of current-attempt advancement and delivery confirmation. */
export interface LocalToolResultCustody {
  readonly store: (
    authority: CoordinationAuthority,
    scope: SessionScope,
    input: ToolResultInput,
  ) => Promise<ToolResultStored | ToolResultFailure | ToolResultUnknown>
  readonly read: (
    authority: CoordinationAuthority,
    scope: SessionScope,
    call: string,
    resultKey: string,
  ) => Promise<ToolResultStored | ToolResultFailure | { readonly kind: 'absent' }>
}

/** The normal-path projection is not the author's immutable original result. */
export interface ToolDeliveryInput {
  readonly witness: ToolResultWitness
  readonly source: SourceToken
  readonly permit: AttemptPermit
  readonly result: ToolMessage['blocks'][0]
  readonly conclusions: readonly string[]
  readonly message: ToolMessage
}
export interface LocalToolResultDelivery {
  readonly confirm: (
    authority: CoordinationAuthority,
    scope: SessionScope,
    input: ToolDeliveryInput,
  ) => Promise<
    | {
        readonly kind: 'confirmed' | 'alreadyConfirmed'
        readonly receipt: ResultReceipt
        readonly messagePosition: JsonNumber
        readonly source: SourceToken
      }
    | ToolResultFailure
    | { readonly failure: 'staleAttempt' | 'terminal' | 'retryFromFacts' }
    | ToolResultUnknown
  >
}
