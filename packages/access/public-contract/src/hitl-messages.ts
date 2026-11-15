import type { TenantId } from '@omne-harness/legal-identity'
import type {
  EmptyBody,
  GovernanceCodecLimits,
  GovernanceDiagnostic,
  GovernanceEncodeResult,
  ProofInput,
} from './messages.ts'

export type HitlCodecLimits = GovernanceCodecLimits
export type HitlDiagnostic = GovernanceDiagnostic
export type HitlEncodeResult = GovernanceEncodeResult

export type HitlCardRef = {
  readonly request: { readonly tenantRef: string; readonly requestId: string }
  readonly cardId: string
}
export type HitlReply =
  | { readonly kind: 'selection'; readonly optionId: string }
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'decline' }
export type HitlCardState = 'pending' | 'decided' | 'invalidated'
export type HitlOriginKind = 'tool' | 'agent-extension' | 'admission' | 'independent'
export type HitlCardFilter = {
  readonly states: readonly HitlCardState[]
  readonly originKind?: HitlOriginKind
  readonly sessionRef?: string
  readonly delivery?: 'pending' | 'accepted' | 'superseded'
}
export type HitlReplySubmission = {
  readonly tenant: TenantId
  readonly card: HitlCardRef
  readonly expectedRevision: string
  readonly reply: HitlReply
  readonly replyId: string
}

export type HitlRequestBodies = {
  'list-cards': {
    readonly tenant: TenantId
    readonly filter: HitlCardFilter
    readonly cursor: string | null
    readonly limit: number
  }
  'read-card': { readonly tenant: TenantId; readonly card: HitlCardRef }
  'submit-reply': HitlReplySubmission
  'query-submit-reply': HitlReplySubmission
}
export type HitlOperation = keyof HitlRequestBodies

export type HitlRequestByOperation = {
  readonly [O in HitlOperation]: {
    readonly protocolVersion: 'hitl-public/1'
    readonly messageId: string
    readonly operation: O
    readonly proof: ProofInput
    readonly body: HitlRequestBodies[O]
  }
}
export type HitlRequest<O extends HitlOperation = HitlOperation> = HitlRequestByOperation[O]

export type HitlOption = {
  readonly id: string
  readonly label: string
  readonly description: string
}
type HitlQuestionFields = {
  readonly cardId: string
  readonly title: string
  readonly description: string
  readonly declineConsequence: string
}
export type HitlQuestion = HitlQuestionFields &
  (
    | { readonly kind: 'question' | 'extension'; readonly options: readonly HitlOption[] }
    | {
        readonly kind: 'approval' | 'admission'
        readonly options: readonly (HitlOption & { readonly effectRef?: string })[]
      }
  )
export type HitlSubmissionRef = {
  readonly tenantRef: string
  readonly actorRef: string
  readonly operationId: string
}
export type HitlDecisionRef = {
  readonly card: HitlCardRef
  readonly decisionId: string
  readonly submission: HitlSubmissionRef
}
export type HitlDecision = {
  readonly ref: HitlDecisionRef
  readonly reply: HitlReply
  readonly basisRef: string
  readonly commitReceipt: string
}
export type HitlCardDelivery =
  | { readonly kind: 'pending' }
  | { readonly kind: 'accepted' | 'superseded'; readonly receiptRef: string }
type HitlCardFields = {
  readonly ref: HitlCardRef
  readonly revision: string
  readonly question: HitlQuestion
}
export type HitlCard = HitlCardFields &
  (
    | { readonly kind: 'pending' }
    | {
        readonly kind: 'decided'
        readonly decision: HitlDecision
        readonly delivery: HitlCardDelivery
      }
    | {
        readonly kind: 'invalidated'
        readonly reason: 'cancelled' | 'archived' | 'origin-terminal' | 'continuity-lost'
        readonly terminalEvidenceRef: string
      }
  )
export type HitlCardOrigin = {
  readonly kind: HitlOriginKind
  readonly sessionRef?: string
  readonly runRef?: string
  readonly toolCallRef?: string
}
export type HitlCardItem = {
  readonly card: HitlCard
  readonly origin: HitlCardOrigin
  readonly displayContext: string
}
export type HitlCardPage = {
  readonly items: readonly HitlCardItem[]
  readonly next: string | null
  readonly snapshotRef: string
  readonly completeness: 'complete' | 'partial'
}
export type HitlReplyResult =
  | {
      readonly kind: 'decided'
      readonly decisionRef: HitlDecisionRef
      readonly revision: string
      readonly delivery: 'pending' | 'accepted'
    }
  | { readonly kind: 'already-decided'; readonly decision: HitlDecision }
  | { readonly kind: 'invalidated'; readonly reason: string }

export type HitlSuccessBodies = {
  'list-cards': HitlCardPage
  'read-card': { readonly item: HitlCardItem }
  'submit-reply': HitlReplyResult
  'query-submit-reply': HitlReplyResult
}
export type HitlOutcomes = {
  'list-cards': 'succeeded' | 'denied' | 'invalid' | 'limited' | 'conflict' | 'basis-unavailable'
  'read-card': 'succeeded' | 'denied' | 'invalid' | 'limited' | 'basis-unavailable'
  'submit-reply':
    | 'succeeded'
    | 'denied'
    | 'invalid'
    | 'limited'
    | 'conflict'
    | 'basis-unavailable'
    | 'unknown'
  'query-submit-reply':
    | 'succeeded'
    | 'not-committed'
    | 'denied'
    | 'invalid'
    | 'limited'
    | 'conflict'
    | 'basis-unavailable'
    | 'unknown'
}
export type HitlLimitedBody = { readonly resource: string; readonly limit: number }

export type HitlProtocolRejected = {
  readonly protocolVersion: 'hitl-public/1'
  readonly messageId?: string
  readonly outcome: 'protocol-rejected'
  readonly body: EmptyBody
}
export type HitlStageNotProvided = {
  readonly protocolVersion: 'hitl-public/1'
  readonly messageId?: string
  readonly outcome: 'stage-not-provided'
  readonly body: EmptyBody
}
export type HitlProtocolResult = HitlProtocolRejected | HitlStageNotProvided
export type HitlBusinessResponse<O extends HitlOperation> = {
  readonly [K in HitlOutcomes[O]]: {
    readonly protocolVersion: 'hitl-public/1'
    readonly messageId: string
    readonly outcome: K
    readonly body: K extends 'succeeded'
      ? HitlSuccessBodies[O]
      : K extends 'limited'
        ? HitlLimitedBody
        : EmptyBody
  }
}[HitlOutcomes[O]]
export type HitlResponseByOperation = {
  readonly [O in HitlOperation]: HitlProtocolResult | HitlBusinessResponse<O>
}
export type HitlResponse<O extends HitlOperation = HitlOperation> = HitlResponseByOperation[O]

export type HitlRequestRead =
  | { readonly kind: 'request'; readonly request: HitlRequest }
  | {
      readonly kind: 'protocol-rejected'
      readonly response: HitlProtocolRejected
      readonly diagnostic: HitlDiagnostic
    }
export type HitlResponseRead<O extends HitlOperation> =
  | { readonly kind: 'response'; readonly response: HitlResponse<O> }
  | { readonly kind: 'unmatched' }
  | { readonly kind: 'unreadable'; readonly diagnostic: HitlDiagnostic }

export type HitlResponseEncodeInput<O extends HitlOperation = HitlOperation> = {
  readonly [K in O]: {
    readonly operation: K
    readonly response: HitlResponse<K>
    readonly limits: HitlCodecLimits
  }
}[O]
