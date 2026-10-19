// The shapes of the conformance entry: what the subject under test gives, what the report says,
// and what a single check is. Every other conformance file depends on this one only for types
// and for the two control-flow errors a check throws.
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
  ModelProvider,
  ModelTransport,
  ResultCapacity,
  Supplier,
  Termination,
  TransportFact,
} from '../index.ts'

/** A call of one tenant. */
export type ConformanceCall = Readonly<{ tenant: TenantId; call: ModelCallId }>

/** The resource actions that access can be taken away from, one by one. */
export type ConformanceAction =
  | 'inspect'
  | 'dispatches'
  | 'cancel'
  | 'connect'
  | 'observe'
  | 'read'
  | 'acknowledge'

/**
 * What only the party that assembled the provider can do: bring a call to a state, give it
 * evidence, take its instance away or take access away. A check that needs a hook the subject
 * does not give is reported as not applicable; it is never counted as passed. A check also reports
 * not applicable when it needs a transport the subject does not give, and the three read checks
 * report it when the provider gives the whole result as one page.
 */
export interface ConformanceHooks<P> {
  /** The call begins running on this dispatch, and the provider records the dispatch as started. */
  startRun?(input: ConformanceCall & Readonly<{ dispatch: DispatchId }>): Promise<void>
  /**
   * The running call receives these upstream facts in order, as its execution would. A fact that
   * the provider refuses ends the processing. The hook does not throw for a refused fact.
   */
  showFacts?(input: ConformanceCall & Readonly<{ facts: readonly TransportFact[] }>): Promise<void>
  /**
   * The call ends with this termination and this result, grouped as complete parts by pageSize and pageTargetBytes. A call that has ended already is left as it is.
   */
  settleCall?(
    input: ConformanceCall &
      Readonly<{
        termination: Termination
        parts: readonly ResultPart[]
        pageSize: number
        pageTargetBytes: number
      }>,
  ): Promise<void>
  /** Durable evidence that the provider accepts for acknowledging the call. Each label gives another one. */
  provideEvidence?(input: ConformanceCall & Readonly<{ label: string }>): Promise<DurableEvidence>
  /**
   * The next `action` with `operation` answers `commit-unknown`. `applied` lets the write take
   * effect anyway, `dropped` leaves nothing behind.
   */
  failNextWrite?(
    input: Readonly<{
      tenant: TenantId
      action: 'admit' | 'cancel' | 'acknowledge'
      operation: ModelOperationId
      effect: 'applied' | 'dropped'
    }>,
  ): Promise<void>
  /** Cleanup of the acknowledged call moves on. */
  advanceCleanup?(input: ConformanceCall): Promise<void>
  /** Cleanup of the acknowledged call cannot go on. */
  blockCleanup?(input: ConformanceCall): Promise<void>
  /** The instance that serves the call leaves. */
  withdrawInstance?(input: ConformanceCall): Promise<void>
  /** Another instance takes over the call. */
  replaceInstance?(input: ConformanceCall & Readonly<{ instance: ModelInstanceId }>): Promise<void>
  /** Every open observation of the call is cut off, and the call goes on. */
  disconnectObservers?(input: ConformanceCall): Promise<void>
  /** The principal loses the right to the action on the call, from now on. */
  revokeAccess?(
    input: ConformanceCall & Readonly<{ principal: P; action: 'all' | ConformanceAction }>,
  ): Promise<void>
  /** The directory that finds live routes cannot be reached. */
  failDirectory?(): Promise<void>
}

export type HookName = keyof ConformanceHooks<unknown>

/** A transport under test, with the one thing that only its builder can tell. */
export type ConformanceTransport = Readonly<{
  transport: ModelTransport
  /**
   * How many business requests have left the transport so far. A transport that is called but
   * has not sent counts nothing. The suite reads it between the steps of the protocol.
   */
  sends(): number
  /**
   * The request and supplier that `prepare` is given; the defaults of the suite when left out. The
   * transport must end its stream with a termination.
   */
  request?: FixedModelRequest
  supplier?: Supplier
}>

/** One provider, with the identities and hooks that the checks use. */
export type ConformanceSubject<P> = Readonly<{
  provider: ModelProvider<P>
  /** A principal that may act on the calls of `tenant`. */
  principal: P
  tenant: TenantId
  /** Another tenant. The principal must not reach the calls of `tenant` through it. */
  otherTenant: TenantId
  /** Values that the provider accepts in `admit`; the defaults of the suite when left out. */
  request?: FixedModelRequest
  consumer?: ConsumerRef
  capacity?: ResultCapacity
  hooks?: ConformanceHooks<P>
  transport?: ConformanceTransport
  /** Releases what the subject holds; called after each check. */
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
] as const

export type ConformanceObligation = (typeof CONFORMANCE_OBLIGATIONS)[number]

export type ObligationResult = Readonly<{
  obligation: ConformanceObligation
  status: 'pass' | 'fail' | 'not-applicable'
  /** Why it failed, or what was missing; empty for a pass. */
  detail: string
}>

export type ConformanceReport = Readonly<{
  /** True when no obligation failed. Obligations that were not applicable do not make it false. */
  ok: boolean
  results: readonly ObligationResult[]
}>

export type ConformanceOptions<P> = Readonly<{
  /**
   * Builds the subject. It is called once for every check, so no check sees the state that
   * another one left behind.
   */
  subject: () => ConformanceSubject<P> | Promise<ConformanceSubject<P>>
  /**
   * The upper bound on every wait for the subject, in milliseconds: the factory, provider methods,
   * hooks, transport steps, `dispose`, observations and facts. Default 1000.
   */
  waitMs?: number
}>

/** What a check is given: the subject, with every default filled in. */
export type Scene<P> = Readonly<{
  subject: ConformanceSubject<P>
  request: FixedModelRequest
  consumer: ConsumerRef
  capacity: ResultCapacity
  waitMs: number
}>

export type Requirement = HookName | 'transport'

export type Check<P> = Readonly<{
  name: ConformanceObligation
  requires: readonly Requirement[]
  run(scene: Scene<P>): Promise<void>
}>

/** A check found a violation. */
export class ConformanceFailure extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConformanceFailure'
  }
}

/** A check found that the subject does not give what it needs. */
export class ConformanceSkip extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConformanceSkip'
  }
}
