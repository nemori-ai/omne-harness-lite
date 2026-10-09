import type { AttemptId, RunId } from '@omne-harness-lite/call-accounts'
import type { CurrentEvaluationInputs } from '@omne-harness-lite/asset-evaluation'
import type { AssetRegistryService } from '@omne-harness-lite/asset-registry'
import type { TenantId } from '@omne-harness-lite/identity-values'
import type { JsonNumber, CallId } from '@omne-harness-lite/content-blocks'
import type { CreationKey } from '@omne-harness-lite/messages'
import type { RuntimeContextOperations } from '@omne-harness-lite/runtime-context'
import type { Clock } from '@omne-harness-lite/offer-expiry'
import type {
  ProjectionRules,
  ProjectionOptions,
} from '@omne-harness-lite/model-message-projection'
import type {
  ModelRuntimeHostInputs,
  ModelIdentitySource,
  SessionRuntimeBinding,
  SessionModelSelectionInput,
  OriginalIssueOwner,
  ModelRuntimeExecutionSource,
  SettlementCoordinatorFactory,
} from '@omne-harness-lite/model-request-runtime'
import type {
  CoordinationAuthority,
  SessionDriverControl,
  SessionDriverPolicy,
} from '@omne-harness-lite/session-runtime'
import type { BorrowedRunJournal } from './run-journal-types.ts'
import type { SessionScope, SessionAccess } from '@omne-harness-lite/session-tenancy'
import type {
  ToolRuntimeInstance,
  ToolOriginalIssueSupport,
} from '@omne-harness-lite/tool-execution-runtime'
import type { LocalSessionIngress } from './runtime-types.ts'
import type { SessionDriverModelFactory } from './driver-model-types.ts'
import type { LocalToolResultCustody, LocalToolResultDelivery } from './tool-result-types.ts'
import type { StateOptions } from './state-types.ts'
import type { SessionModelResultSource } from './model-result-source.ts'

declare const workTokenBrand: unique symbol
export interface SessionDriverWorkToken {
  readonly [workTokenBrand]: true
}
/** Same owner supplied to Ingress.workSettledIn. Missing or uncertain work is never settled. */
export interface SessionDriverWorkOwner {
  readonly readIn: StateOptions['workSettledIn']
  readonly begin: (
    scope: SessionScope,
    preparation: Extract<
      import('@omne-harness-lite/session-runtime').SessionLifecycleStep,
      { kind: 'prepareCall' }
    >,
  ) => SessionDriverWorkToken
  readonly complete: (token: SessionDriverWorkToken) => void
  readonly release: (token: SessionDriverWorkToken) => void
}

/** One real original-Run source borrow. The driver constructs its own log, call access and report. */
export interface SessionDriverRunSources {
  readonly scope: SessionScope
  readonly run: RunId
  readonly evaluation: CurrentEvaluationInputs
  /** Actual adopted registry. Lookup-only model bindings cannot produce a Run report. */
  readonly registry: Pick<AssetRegistryService, 'refreshAvailability' | 'list'>
  readonly context: RuntimeContextOperations
  readonly contextGeneration: () => string | null
  readonly toolAccess: SessionAccess
  readonly providers: Omit<SessionRuntimeBinding, 'log' | 'selection' | 'currentEvaluationInputs'>
  readonly selection: Omit<SessionModelSelectionInput, 'binding' | 'currentEvaluationInputs'>
  readonly host: Omit<ModelRuntimeHostInputs, 'sessions' | 'callAccess' | 'identities'>
  readonly projection: { readonly rules: ProjectionRules; readonly options?: ProjectionOptions }
  readonly release: () => Promise<void>
}
export interface SessionDriverRunSourceFactory {
  readonly acquire: (
    scope: SessionScope,
    journal: BorrowedRunJournal,
  ) => Promise<SessionDriverRunSources | { readonly unavailable: true }>
}

export interface SessionDriverInvocationIdentities {
  readonly prepareKey: string
  readonly originalPosition: string
  readonly resultKey: string
  readonly adoptionKey: string
}
/** Repeated coordinates resolve to the same original identities, even after a lost receipt. */
export interface SessionDriverIdentitySource {
  readonly run: (
    scope: SessionScope,
    inputPosition: JsonNumber,
  ) => { readonly startKey: string; readonly attemptKey: string }
  readonly model: (
    scope: SessionScope,
    run: RunId,
    attempt: AttemptId,
    originPosition: JsonNumber,
  ) => SessionDriverInvocationIdentities & {
    readonly call: ReturnType<ModelIdentitySource['call']>
    readonly creationKey: CreationKey
  }
  readonly tool: (
    scope: SessionScope,
    run: RunId,
    attempt: AttemptId,
    originPosition: JsonNumber,
    call: CallId,
  ) => SessionDriverInvocationIdentities
  readonly modelContent: Pick<ModelIdentitySource, 'response' | 'message'>
}

/** Required driver adoption surface; the current five-operation Ingress alone is insufficient. */
export interface SessionDriverIngress extends LocalSessionIngress {
  readonly toolResults: LocalToolResultCustody
  readonly toolDelivery: LocalToolResultDelivery
  readonly toolInvocation: {
    readonly support: (
      authority: CoordinationAuthority,
    ) => Promise<ToolOriginalIssueSupport | { readonly unavailable: true }>
  }
}
/** Borrow the same original native runtime; release never substitutes observer release for stopped. */
export interface SessionDriverToolBorrow {
  readonly tenant: TenantId
  readonly runtime: ToolRuntimeInstance
  readonly release: () => Promise<void>
}
export interface SessionDriverToolFactory {
  readonly acquire: (
    support: ToolOriginalIssueSupport,
  ) => Promise<SessionDriverToolBorrow | { readonly unavailable: true }>
}

/** Pure trusted construction. No process paths, socket, command, UI or inferred grants. */
export interface LocalSessionDriverOptions {
  readonly tenant: TenantId
  readonly ingress: SessionDriverIngress
  readonly work: SessionDriverWorkOwner
  readonly clock: Clock
  readonly policy: SessionDriverPolicy
  readonly identities: SessionDriverIdentitySource
  readonly sources: SessionDriverRunSourceFactory
  readonly model: {
    readonly factory: SessionDriverModelFactory
    readonly original: OriginalIssueOwner
    readonly executionSource: () => ModelRuntimeExecutionSource | undefined
    /** Same original source whose verifyIn is supplied to Ingress.modelResults. */
    readonly results: SessionModelResultSource
    readonly settlement: SettlementCoordinatorFactory
    readonly maxCallReads: number
  }
  readonly tools: SessionDriverToolFactory
  readonly diagnostic: (error: unknown) => void
}
/** E1 supplies the actual createLocalSessionDriver implementation with this signature. */
export interface LocalSessionDriverFactory {
  readonly create: (
    options: LocalSessionDriverOptions,
    signal: AbortSignal,
  ) => Promise<SessionDriverControl>
}
