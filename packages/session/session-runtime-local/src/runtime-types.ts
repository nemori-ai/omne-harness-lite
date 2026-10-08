import type {
  OriginalIssueAuthority,
  OriginalIssueParticipant,
  OriginalIssueTicket,
  OriginalIssueStage,
} from '@omne-harness-lite/model-request-runtime'
import type { SessionRef } from '@omne-harness-lite/messages'
import type { AtomicStorage } from '@omne-harness-lite/storage'
import type { TenantId } from '@omne-harness-lite/identity-values'
import type { SessionScope, SessionTenancyService } from '@omne-harness-lite/session-tenancy'
import type {
  Access,
  PublicFailure,
  Failure,
  CreateSessionInput,
  SessionRuntime,
  CoordinationAuthority,
  CoordinationStep,
  StepCommit,
} from '@omne-harness-lite/session-runtime'
import type { SourceToken } from '@omne-harness-lite/session-log'
import type { LogAuthorityOperations, SessionLogParticipant } from '@omne-harness-lite/session-log'
import type { AdmissionSource, AdmissionTicket, LocalAdmission } from './admission-types.ts'
import type { StateOptions, StatePolicy } from './state-types.ts'
import type { ReceiptPolicy } from './receipt-types.ts'

/** The host must durably bind the original recipe and initialize its real Session Context before ready. */
export interface SessionBootstrap {
  readonly initialize: (
    scope: SessionScope,
    input: CreateSessionInput,
    originalTicket: AdmissionTicket,
  ) => Promise<'ready' | 'definitionUnavailable' | 'unavailable'>
}
export interface RuntimePolicy {
  readonly maxSessions: number
  readonly maxRecordBytes: number
  readonly maxInFlight: number
  readonly maxSteps: number
  readonly state: StatePolicy
  readonly receipts: ReceiptPolicy
}
/** Private trusted construction. These values are not command or protocol body claims. */
export interface RuntimeOptions {
  readonly storage: AtomicStorage
  readonly admission: LocalAdmission
  readonly source: AdmissionSource
  readonly tenant: TenantId
  readonly principal: string
  readonly policy: RuntimePolicy
  /** Creates a borrowed participant with the actual same storage and live authority checks. */
  readonly log: (authority: LogAuthorityOperations) => SessionLogParticipant
  readonly bootstrap: SessionBootstrap
  readonly now: () => string | 'unavailable'
  readonly workSettledIn: StateOptions['workSettledIn']
  /** Root-selected original model owner. Omission means model admission is unavailable. */
  readonly modelIssue?: {
    readonly maxRecords: number
    readonly current: OriginalIssueAuthority
    readonly create: (binding: {
      readonly log: SessionLogParticipant
      readonly access: import('@omne-harness-lite/session-log').LogAuthority
      readonly authority: OriginalIssueAuthority
    }) => OriginalIssueParticipant
  }
}
export type SessionIngressOperations = Pick<
  SessionRuntime,
  'createSession' | 'readSession' | 'submitInput' | 'readReceipt' | 'readProgress'
>
export interface LocalSessionIngress {
  readonly access: Access
  readonly operations: SessionIngressOperations
  /** Trusted host read only. Full journal data must never be sent as ordinary client output. */
  readonly journal: {
    readonly readPrefix: (
      access: Access,
      session: SessionRef,
    ) => Promise<
      Awaited<ReturnType<SessionLogParticipant['readPrefix']>> | PublicFailure | Failure<'notFound'>
    >
  }
  /** Trusted assembly reader over this owner's immutable persisted Session reservations. */
  readonly tenancy: SessionTenancyService
  /** Trusted host port. Do not send its live authority or permits over a wire protocol. */
  readonly coordinationAuthority: CoordinationAuthority
  readonly modelInvocation: {
    readonly admit: (
      authority: CoordinationAuthority,
      scope: SessionScope,
      source: SourceToken,
      preparation: Extract<SessionLifecycleStep, { kind: 'prepareCall' }>,
      ticket: OriginalIssueTicket,
    ) => Promise<
      | Exclude<OriginalIssueStage, { kind: 'staged' }>
      | {
          readonly kind: 'issued'
          readonly claim: Extract<OriginalIssueStage, { kind: 'staged' }>['claim']
          readonly identity: Extract<OriginalIssueStage, { kind: 'staged' }>['identity']
          readonly positions: readonly import('@omne-harness-lite/content-blocks').JsonNumber[]
        }
      | {
          readonly kind: 'unknownCommit'
          readonly scope: SessionScope
          readonly call: string
          readonly originalPosition: string
        }
      | Failure<
          'invalidInput' | 'denied' | 'unavailable' | 'retryFromFacts' | 'staleAttempt' | 'terminal'
        >
    >
  }
  readonly lifecycle: {
    readonly commitStep: (
      authority: CoordinationAuthority,
      scope: SessionScope,
      expectedSource: SourceToken,
      step: SessionLifecycleStep,
    ) => Promise<StepCommit>
  }
  /** Stops new public operations and waits for admitted work. Borrowed providers stay open. */
  readonly close: () => Promise<void>
}
export type SessionLifecycleStep = Extract<
  CoordinationStep,
  { kind: 'startRun' | 'startAttempt' | 'adoptInput' | 'prepareCall' | 'finish' }
>
export interface CreationRow {
  operation: string
  session: string
  input: string
  semantic: string
  published: number
}
export interface RuntimeDb {
  sr_session_creation: CreationRow
}
