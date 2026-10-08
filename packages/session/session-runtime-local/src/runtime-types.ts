import type { AtomicStorage } from '@omne-harness-lite/storage'
import type { TenantId } from '@omne-harness-lite/identity-values'
import type { SessionScope, SessionTenancyService } from '@omne-harness-lite/session-tenancy'
import type {
  Access,
  CreateSessionInput,
  SessionRuntime,
  CoordinationAuthority,
  CoordinationStep,
  StepCommit,
} from '@omne-harness-lite/session-runtime'
import type { SourceToken } from '@omne-harness-lite/session-log'
import type { LogAuthorityOperations, SessionLogParticipant } from '@omne-harness-lite/session-log'
import type { AdmissionSource, LocalAdmission } from './admission-types.ts'
import type { StateOptions, StatePolicy } from './state-types.ts'
import type { ReceiptPolicy } from './receipt-types.ts'

/** The host must durably bind the original recipe and initialize its real Session Context before ready. */
export interface SessionBootstrap {
  readonly initialize: (
    scope: SessionScope,
    input: CreateSessionInput,
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
}
export type SessionIngressOperations = Pick<
  SessionRuntime,
  'createSession' | 'readSession' | 'submitInput' | 'readReceipt' | 'readProgress'
>
export interface LocalSessionIngress {
  readonly access: Access
  readonly operations: SessionIngressOperations
  /** Trusted assembly reader over this owner's immutable persisted Session reservations. */
  readonly tenancy: SessionTenancyService
  /** Trusted host port. Do not send its live authority or permits over a wire protocol. */
  readonly coordinationAuthority: CoordinationAuthority
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
  { kind: 'startRun' | 'startAttempt' | 'adoptInput' | 'finish' }
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
