import type { AtomicStorage } from '@omne-harness-lite/storage'
import type { Clock } from '@omne-harness-lite/offer-expiry'
import type { GovernanceClientOperations } from '@omne-harness-lite/governance-client-operations'
import type {
  RuntimePolicy,
  AdmissionSource,
  LocalSessionIngress,
  LocalSessionAccessOptions,
  LocalSessionAccess,
} from '@omne-harness-lite/session-runtime-local'
import type {
  ModelRuntimeExecutionSource,
  OriginalIssueAuthority,
} from '@omne-harness-lite/model-request-runtime'
import type { AdmissionPolicy } from '@omne-harness-lite/session-runtime-local'
import type {
  SessionBootstrapAssembly,
  SessionBootstrapOptions,
} from './session-bootstrap-types.ts'
import type { SessionOriginalModelOwner } from './session-model-owner.ts'
import type {
  SessionModelResultSource,
  SessionModelResultSourceOptions,
} from './session-model-results.ts'
import type { RunningSessionHostOptions } from './session-execution-host.ts'
import type { TenantBinding } from './state-layout-values.ts'
import type { SessionCreationDefaults } from './session-host-protocol.ts'

/** Trusted application inputs. No callback, Unit or execution source is ordinary command data. */
export interface SessionRuntimeRootOptions {
  readonly home: string
  readonly binding: TenantBinding
  readonly source: AdmissionSource
  readonly rootStorage: AtomicStorage
  readonly storage: AtomicStorage
  readonly governance: GovernanceClientOperations
  readonly clock: Clock
  readonly inputSource: SessionBootstrapOptions['inputSource']
  readonly contextSeed: SessionBootstrapOptions['contextSeed']
  /** Actual deployment preferences. Omission disables ordinary default creation; it never selects an asset. */
  readonly creation?: SessionCreationDefaults
  readonly runtimePolicy: RuntimePolicy
  readonly admissionPolicy: AdmissionPolicy
  readonly logOperationLimit: number
  readonly contextAccess: (
    ingress: LocalSessionIngress,
  ) => Omit<LocalSessionAccessOptions, 'tenant'>
  readonly model: {
    readonly current: OriginalIssueAuthority
    readonly maxInFlight: number
    readonly maxRecords: number
    readonly maxCaptures: number
    readonly executionSource: () => ModelRuntimeExecutionSource | undefined
    readonly retainReferencesIn: SessionModelResultSourceOptions['retainReferencesIn']
    readonly configure: (owners: SessionRuntimeRootOwners) => RunningSessionHostOptions['model']
  }
  readonly transport: RunningSessionHostOptions['transport']
  readonly execution: RunningSessionHostOptions['execution']
  readonly identities: RunningSessionHostOptions['identities']
  readonly diagnostic: (error: unknown) => void
}
export interface SessionRuntimeRootOwners {
  readonly ingress: LocalSessionIngress
  readonly contextAccess: LocalSessionAccess
  readonly bootstrap: SessionBootstrapAssembly
  readonly originalModel: SessionOriginalModelOwner
  readonly modelResults: SessionModelResultSource
}
export interface SessionRuntimeRoot {
  readonly socketPath: string
  /** Trusted bootstrap/inspection only. Ordinary clients use the private socket protocol. */
  readonly owners: SessionRuntimeRootOwners
  /** Borrowed dependencies remain with the caller. After known pending resources are returned,
   * an explicit close can finish the original shutdown. It never reopens admission or retries IO. */
  readonly close: () => Promise<{ readonly closed: true } | { readonly pending: true }>
}
