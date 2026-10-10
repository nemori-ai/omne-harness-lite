import type {
  ToolOriginalIssueAuthority,
  ToolOriginalIssueSupport,
  ToolResultCustodySource,
} from '@omne-harness-lite/tool-execution-runtime'
import type {
  OriginalIssueAuthority,
  OriginalIssueParticipant,
  ModelExecutionJob,
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
  SessionIngressOperations,
  SessionLifecycle,
  SessionLifecycleStep,
  CoordinationAuthority,
  SessionWorkReading,
} from '@omne-harness-lite/session-runtime'
import type { SourceToken } from '@omne-harness-lite/session-log'
import type { LogAuthorityOperations, SessionLogParticipant } from '@omne-harness-lite/session-log'
import type { AdmissionSource, AdmissionTicket, LocalAdmission } from './admission-types.ts'
import type { StateOptions, StatePolicy } from './state-types.ts'
import type { ReceiptPolicy } from './receipt-types.ts'
import type { OriginalRunJournal } from './run-journal-types.ts'
import type { ModelResultSource, LocalModelResultCustody } from './model-result-types.ts'
import type { LocalToolResultCustody, LocalToolResultDelivery } from './tool-result-types.ts'
import type {
  ReadPassConclusionsInput,
  RunnerReplayFailure,
} from '@omne-harness-lite/loop-extension-runner'
import type { Conclusion } from '@omne-harness-lite/loop-extension'

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
  /** Read the current local login for new work; fixed center/account ownership still applies. */
  readonly readAdmissionSource?: () => Promise<
    { readonly source: AdmissionSource } | { readonly failure: 'loginRequired' | 'unavailable' }
  >
  readonly tenant: TenantId
  readonly principal: string
  readonly policy: RuntimePolicy
  /** Creates a borrowed participant with the actual same storage and live authority checks. */
  readonly log: (authority: LogAuthorityOperations) => SessionLogParticipant
  readonly bootstrap: SessionBootstrap
  readonly now: () => Promise<string | 'unavailable'>
  readonly workSettledIn: StateOptions['workSettledIn']
  /** Explicit original result source and custody capacity. Absence grants no result custody. */
  readonly modelResults?: {
    readonly maxRecords: number
    readonly source: ModelResultSource
  }
  /** Explicit original Tool qualification and durable Session proof capacity. */
  readonly toolIssue?: {
    readonly maxRecords: number
    readonly current: ToolOriginalIssueAuthority
  }
  readonly toolResults?: {
    readonly maxRecords: number
    readonly source: ToolResultCustodySource
  }
  /** Root-selected pure interpreter; it reads only the provided exact-prefix history. */
  readonly toolDelivery?: {
    readonly readConclusions: (
      input: ReadPassConclusionsInput,
    ) => readonly Conclusion[] | RunnerReplayFailure
  }
  /** Root-selected original model owner. Omission means model admission is unavailable. */
  readonly modelIssue?: {
    readonly maxRecords: number
    readonly create: (binding: {
      readonly log: Pick<SessionLogParticipant, 'appendIn' | 'readByKeyIn'>
      readonly access: import('@omne-harness-lite/session-log').LogAuthority
      readonly authority: OriginalIssueAuthority
    }) => OriginalIssueParticipant
  }
}
export type {
  SessionIngressOperations,
  SessionLifecycleStep,
} from '@omne-harness-lite/session-runtime'
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
  readonly scanWork: SessionWorkReading['scanWork']
  readonly readWork: SessionWorkReading['readWork']
  readonly toolInvocation: {
    readonly support: (
      authority: CoordinationAuthority,
    ) => Promise<ToolOriginalIssueSupport | { readonly unavailable: true }>
  }
  readonly toolResults: LocalToolResultCustody
  readonly toolDelivery: LocalToolResultDelivery
  readonly modelInvocation: {
    readonly admit: (
      authority: CoordinationAuthority,
      scope: SessionScope,
      source: SourceToken,
      preparation: Extract<SessionLifecycleStep, { kind: 'prepareCall' }>,
      job: ModelExecutionJob,
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
  readonly modelResults: LocalModelResultCustody
  readonly runJournal: OriginalRunJournal
  readonly lifecycle: SessionLifecycle
  /** Stops new public operations and waits for admitted work. Borrowed providers stay open. */
  readonly close: () => Promise<void>
}
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
