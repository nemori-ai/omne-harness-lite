import type { TenantId } from '@omne-harness/legal-identity'
import type {
  ConsumerRef,
  DispatchId,
  DurableEvidence,
  FixedModelRequest,
  ResultPart,
  ModelCallId,
  ModelInstanceId,
  ModelOperationId,
  Supplier,
  Termination,
} from '../index.ts'
import type { ModelLiveCalls } from '../live-call.ts'
import type { ModelProvider, ModelTransport, TransportFact } from '../provider/index.ts'

export type ConformanceCall = Readonly<{ tenant: TenantId; call: ModelCallId }>

export type ConformanceAction =
  | 'inspect'
  | 'dispatches'
  | 'cancel'
  | 'connect'
  | 'observe'
  | 'read'
  | 'acknowledge'

export interface ConformanceHooks<P> {
  startRun?(input: ConformanceCall & Readonly<{ dispatch: DispatchId }>): Promise<void>
  showFacts?(input: ConformanceCall & Readonly<{ facts: readonly TransportFact[] }>): Promise<void>
  settleCall?(
    input: ConformanceCall &
      Readonly<{
        termination: Termination
        parts: readonly ResultPart[]
        pageSize: number
        pageTargetBytes: number
      }>,
  ): Promise<void>
  provideEvidence?(input: ConformanceCall & Readonly<{ label: string }>): Promise<DurableEvidence>
  failNextWrite?(
    input: Readonly<{
      tenant: TenantId
      action: 'admit' | 'cancel' | 'acknowledge'
      operation: ModelOperationId
      effect: 'applied' | 'dropped'
    }>,
  ): Promise<void>
  advanceCleanup?(input: ConformanceCall): Promise<void>
  blockCleanup?(input: ConformanceCall): Promise<void>
  withdrawInstance?(input: ConformanceCall): Promise<void>
  replaceInstance?(input: ConformanceCall & Readonly<{ instance: ModelInstanceId }>): Promise<void>
  disconnectObservers?(input: ConformanceCall): Promise<void>
  revokeAccess?(
    input: ConformanceCall & Readonly<{ principal: P; action: 'all' | ConformanceAction }>,
  ): Promise<void>
  failDirectory?(): Promise<void>
}

export type HookName = keyof ConformanceHooks<unknown>

export type ConformanceTransport = Readonly<{
  transport: ModelTransport
  sends(): number
  request?: FixedModelRequest
  supplier?: Supplier
}>

/** The live calls of the subject, and the steps a live call's upstream takes. */
export type ConformanceLive<P> = Readonly<{
  calls: ModelLiveCalls<P>
  /** Admits a live call on a profile that takes text and voice in. */
  admit(label: string): Promise<ConformanceCall>
  /** The session of the call opens, or its upstream closes it. */
  upstream(input: ConformanceCall & Readonly<{ step: 'open' | 'close' }>): Promise<void>
  /** This process loses the live body of the call before it settles. */
  loseBody(input: ConformanceCall): Promise<void>
}>

export type ConformanceSubject<P> = Readonly<{
  provider: ModelProvider<P>
  principal: P
  tenant: TenantId
  otherTenant: TenantId
  request?: FixedModelRequest
  consumer?: ConsumerRef
  hooks?: ConformanceHooks<P>
  transport?: ConformanceTransport
  live?: ConformanceLive<P>
  dispose?(): Promise<void>
}>

export const CONFORMANCE_OBLIGATIONS = [
  'admission-repeat-recognised',
  'admission-conflict-on-different-input',
  'operation-not-reused-across-methods',
  'admission-is-not-a-send',
  'reserved-operation-refused',
  'refused-admission-forms-no-call',
  'commit-unknown-keeps-operation',
  'commit-unknown-not-reported-as-refusal',
  'commit-unknown-cancel-recovers-original',
  'commit-unknown-acknowledge-recovers-original',
  'mixed-partial-result-readable',
  'settled-call-keeps-termination',
  'read-before-settle-refused',
  'acknowledge-refused-before-settle',
  'forged-evidence-refused',
  'acknowledge-records-custody',
  'duplicate-acknowledge-returns-original',
  'acknowledge-conflict-on-different-input',
  'acknowledged-result-not-read-again',
  'acknowledge-and-read-serialised',
  'read-page-stable-for-same-after',
  'close-read-idempotent',
  'acknowledge-keeps-open-read-readable',
  'revoked-reader-gets-no-page',
  'cleanup-failure-keeps-acknowledgement',
  'repeat-cancel-returns-original-control',
  'cancel-does-not-claim-stop',
  'cancelled-call-ends-interrupted-unacknowledged',
  'cancel-confined-to-target-call',
  'unauthorised-cancel-denied',
  'cancel-sends-nothing-more',
  'contact-without-call-is-not-accepted',
  'contact-on-open-call-claims-no-end',
  'contact-on-unacknowledged-result-claims-no-run',
  'contact-on-acknowledged-result-is-settled',
  'contact-changes-nothing',
  'observation-opens-with-snapshot',
  'stopping-observation-keeps-call-running',
  'disconnect-ends-observation-as-unavailable',
  'new-observer-starts-from-snapshot',
  'growing-block-holds-accumulated-value',
  'sealed-block-takes-no-more-fill',
  'unsealed-tool-arguments-not-executable',
  'cross-tenant-access-refused',
  'refusal-hides-existence',
  'revoked-principal-gets-denied',
  'revoked-principal-observation-ends-denied',
  'withdrawn-instance-has-no-live-route',
  'directory-failure-is-unavailable',
  'replaced-instance-ends-observation-as-stale',
  'quiesce-refuses-new-admissions',
  'quiesce-reports-pending-and-running',
  'transport-sends-only-at-start',
  'repeated-transport-step-sends-nothing',
  'materialization-receipt-matches-request',
  'fact-stream-ends-once',
  'interruption-is-confirmed',
  'transport-close-is-idempotent',
  'live-command-before-open-refused',
  'live-command-taken-once',
  'live-command-outside-profile-refused',
  'live-command-after-settle-refused',
  'live-end-before-open-refused',
  'live-end-durable-and-idempotent',
  'live-end-after-settle-idempotent',
  'live-media-by-phase-and-modality',
  'live-call-of-another-tenant-unknown',
  'live-lost-body-unavailable',
] as const

export type ConformanceObligation = (typeof CONFORMANCE_OBLIGATIONS)[number]

export type ObligationResult = Readonly<{
  obligation: ConformanceObligation
  status: 'pass' | 'fail' | 'not-applicable'
  detail: string
}>

export type ConformanceReport = Readonly<{
  ok: boolean
  results: readonly ObligationResult[]
}>

export type ConformanceOptions<P> = Readonly<{
  subject: () => ConformanceSubject<P> | Promise<ConformanceSubject<P>>
  waitMs?: number
}>

export type Scene<P> = Readonly<{
  subject: ConformanceSubject<P>
  request: FixedModelRequest
  consumer: ConsumerRef
  waitMs: number
}>

export type Requirement = HookName | 'transport' | 'live'

export type Check<P> = Readonly<{
  name: ConformanceObligation
  requires: readonly Requirement[]
  run(scene: Scene<P>): Promise<void>
}>

export class ConformanceFailure extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConformanceFailure'
  }
}

export class ConformanceSkip extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConformanceSkip'
  }
}
