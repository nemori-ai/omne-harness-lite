import type { AtomicStorage } from '@omne-harness-lite/storage'
import type { SqlSessionLog } from '@omne-harness-lite/session-log-sql'
import type { AssemblyManifestStore } from '@omne-harness-lite/assembly-manifest-store'
import type { Clock } from '@omne-harness-lite/offer-expiry'
import type { GovernanceClientOperations } from '@omne-harness-lite/governance-client-operations'
import type {
  RuntimePolicy,
  AdmissionSource,
  LocalSessionIngress,
  LocalSessionAccessOptions,
  LocalSessionAccess,
  LocalSessionDriverOptions,
  SessionDriverWorkOwner,
  RuntimeOptions,
} from '@omne-harness-lite/session-runtime-local'
import type { ModelRuntimeExecutionSource } from '@omne-harness-lite/model-request-runtime'
import type { AdmissionPolicy } from '@omne-harness-lite/session-runtime-local'
import type {
  SessionBootstrapAssembly,
  SessionBootstrapOptions,
} from './session-bootstrap-types.ts'
import type { SessionOriginalModelOwner } from './session-model-owner.ts'
import type {
  SessionModelResultSource,
  SessionModelResultSourceOptions,
} from '@omne-harness-lite/session-runtime-local'
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
  readonly initialRouteName?: string
  readonly runtimePolicy: RuntimePolicy
  readonly admissionPolicy: AdmissionPolicy
  readonly logOperationLimit: number
  readonly contextAccess: (
    ingress: LocalSessionIngress,
  ) => Omit<LocalSessionAccessOptions, 'tenant'>
  readonly model: {
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
  readonly manifest: AssemblyManifestStore
  readonly log: SqlSessionLog
  readonly ingress: LocalSessionIngress
  readonly contextAccess: LocalSessionAccess
  readonly bootstrap: SessionBootstrapAssembly
  readonly originalModel: SessionOriginalModelOwner
  readonly modelResults: SessionModelResultSource
}
export type SessionDriverRootBinding = Omit<
  LocalSessionDriverOptions,
  'tenant' | 'ingress' | 'work' | 'clock' | 'diagnostic' | 'model'
> & {
  readonly model: Omit<
    LocalSessionDriverOptions['model'],
    'original' | 'executionSource' | 'results'
  >
}
export type SessionDriverRuntimeRootOptions = Omit<
  SessionRuntimeRootOptions,
  'model' | 'execution' | 'identities'
> & {
  readonly model: Omit<SessionRuntimeRootOptions['model'], 'configure'>
  readonly tools?: Pick<RuntimeOptions, 'toolIssue' | 'toolResults' | 'toolDelivery'> & {
    /** End owned Tool resources after the driver stops and before shared Context/log closure. */
    readonly close?: () => Promise<void>
  }
  readonly configure: (
    owners: SessionRuntimeRootOwners,
    work: SessionDriverWorkOwner,
  ) => SessionDriverRootBinding | Promise<SessionDriverRootBinding>
  readonly maxHeld: number
}
export interface SessionRuntimeRoot {
  readonly socketPath: string
  /** Trusted bootstrap/inspection only. Ordinary clients use the private socket protocol. */
  readonly owners: SessionRuntimeRootOwners
  /** Borrowed dependencies remain with the caller. After known pending resources are returned,
   * an explicit close can finish the original shutdown. It never reopens admission or retries IO. */
  readonly close: () => Promise<{ readonly closed: true } | { readonly pending: true }>
}
