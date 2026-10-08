import type { TenantId } from '@omne-harness-lite/identity-values'
import type { AtomicStorage } from '@omne-harness-lite/storage'
import type {
  SessionTenancyService,
  SessionAccessOperations,
  SessionScope,
} from '@omne-harness-lite/session-tenancy'
import type { ContextSessionSeed } from '@omne-harness-lite/runtime-context'
import type { SessionLogBackingOperations } from '@omne-harness-lite/session-log'
import type { Clock } from '@omne-harness-lite/offer-expiry'
import type {
  NonConnectorEvaluationInput,
  CurrentEvaluationInputs,
} from '@omne-harness-lite/asset-evaluation'
import type { EvaluationStorageDependencies } from '@omne-harness-lite/evaluation-input-store'
import type {
  SessionBootstrap,
  LocalAdmission,
  AdmissionSource,
} from '@omne-harness-lite/session-runtime-local'
import type { LocalSessionContext } from '@omne-harness-lite/session-runtime-local/cordis'

export interface SessionBootstrapOptions {
  readonly storage: AtomicStorage
  readonly admission: LocalAdmission
  readonly source: AdmissionSource
  readonly tenant: TenantId
  readonly inputSource: Omit<EvaluationStorageDependencies, 'storage' | 'sessionTenancy'>
  readonly tenancy: SessionTenancyService
  readonly logBacking: SessionLogBackingOperations
  readonly access: SessionAccessOperations
  readonly clock: Clock
  /** Actual deployment/definition owner supplies a complete seed. No fallback or synthesized keys. */
  readonly contextSeed: (
    scope: SessionScope,
    input: NonConnectorEvaluationInput,
  ) => Promise<{ readonly seed: ContextSessionSeed } | { readonly unavailable: true }>
}
export interface SessionBootstrapAssembly extends SessionBootstrap {
  /** Trusted host lookup. These references must not be exposed in the ordinary client protocol. */
  readonly context: (scope: SessionScope) => LocalSessionContext | undefined
  readonly inputs: (scope: SessionScope) => CurrentEvaluationInputs | undefined
  readonly close: () => Promise<void>
  readonly retryClose: () => Promise<void>
}
