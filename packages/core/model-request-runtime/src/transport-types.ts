import type { JsonNumber, JsonObject, JsonValue } from '@omne-harness-lite/content-blocks'
import type { ModelRequestParameters, ModelProfileContent, ProviderName, ModelAdaptationBinding } from '@omne-harness-lite/model-profile'
import type { TokenMargin } from './planning-types.ts'
import type { TokenMeasurement, InputMeter } from './input-meter.ts'
import type { RetirementPolicy } from './retirement-policy.ts'
import type { PlannedSemantics, TransportAdapter } from './invocation-types.ts'
import type { CredentialRedactionConfig } from './credential-redaction-types.ts'

export type UnifiedParameterName = Exclude<keyof ModelRequestParameters, 'extra'>

export type ParameterRule<T> =
  | { readonly kind: 'pass' }
  | { readonly kind: 'drop' }
  | {
      readonly kind: 'select'
      readonly accepted:
        | { readonly values: readonly T[] }
        | { readonly minimum: JsonNumber; readonly maximum: JsonNumber }
      readonly otherwise: { readonly drop: true } | { readonly adjustTo: T }
    }

export type ParameterRules = {
  readonly [K in UnifiedParameterName]: ParameterRule<NonNullable<ModelRequestParameters[K]>>
}

export type CacheBreakpoint = 'system' | 'last_tool' | 'last_message'

export type CacheDeclaration =
  | { readonly mode: 'automatic' }
  | {
      readonly mode: 'explicit'
      readonly ttlValues: readonly string[]
      readonly breakpointLayouts: readonly (readonly CacheBreakpoint[])[]
    }

export type CachePolicy =
  | { readonly mode: 'automatic' }
  | {
      readonly mode: 'explicit'
      readonly ttl: string
      readonly breakpoints: readonly CacheBreakpoint[]
    }

export type ModelCapabilities = Pick<
  ModelProfileContent,
  | 'inputModalities'
  | 'outputModalities'
  | 'maxInputTokens'
  | 'maxOutputTokens'
  | 'inputConstraints'
  | 'upstreamInputLimits'
>

export interface ModelRoute {
  readonly reminderRole: 'developer' | 'user'
  readonly parameters: ParameterRules
  readonly extra: Readonly<Record<string, ParameterRule<JsonValue>>>
  readonly cache: CacheDeclaration
}

export interface ModelDefinition {
  readonly modelId: string
  readonly revision: string
  readonly implementation: { readonly name: string; readonly revision: string }
  readonly capabilities: ModelCapabilities
  readonly routes: Readonly<Record<ProviderName, ModelRoute>>
}

export type DefinitionCoordinates = Pick<ModelAdaptationBinding, 'implementation' | 'definition'>

export type DefinitionResult<T> =
  { readonly ok: T } | { readonly rejected: 'invalidInput' | 'unavailable' }

export interface PlannedRequest extends PlannedSemantics {
  readonly body: JsonObject
  readonly serialized: string
  readonly inputLimitEvidence: FinalInputEvidence
}

export interface TransportPolicy {
  readonly maxConnections: number
  readonly idleConnectionTimeoutMs: number
  readonly connectTimeoutMs: number | null
  readonly maxErrorBodyBytes: number
  readonly maxSseEventBytes: number
  readonly credentialRedaction: CredentialRedactionConfig
}

export interface RawResponse {
  readonly stopped: Promise<void>
  readonly stop: () => void
}

export interface FinalInputEvidence {
  readonly meterRevision: string
  readonly meterEvidence: string
  readonly inputTokens: TokenMeasurement
  readonly tokenMargin: TokenMargin
  readonly admissionTokens?: JsonNumber
  readonly requestBytes: number
  readonly imageBytes: readonly number[]
  readonly images: number
}

export type RetirementResult =
  | { readonly retired: true }
  | { readonly remaining_active: true; readonly references: number; readonly executions: number }
  | { readonly cleanup_failed: true }
  | { readonly rejected: 'invalidInput' }

export interface AdaptationRegistration {
  readonly definition: ModelDefinition
}

export interface AdaptationLease {
  readonly binding: ModelAdaptationBinding
  readonly transport: TransportAdapter<PlannedRequest, RawResponse>
  readonly signal: AbortSignal
  /** Retains this lease until the registered callback/settlement work actually completes. */
  readonly track: <T>(completion: Promise<T>) => Promise<T>
  /** Stops admitting new work; pending executions retain the reference until they finish. */
  readonly release: () => void
}

export interface ModelTransportService {
  /** Cache cleanup remains callable after admission closes or a lease is released. */
  readonly clearReuseScope: (scope: object) => void
  /** Instance-local network diagnostic delivery health, including after close. */
  readonly diagnostics: () => Readonly<{ failed: number; pending: number; dropped: number }>
  readonly registerAdaptation: (
    definition: ModelDefinition,
    meter: InputMeter,
    owner: object,
    cleanup: () => void | Promise<void>,
  ) => { readonly registered: AdaptationRegistration } | { readonly rejected: 'invalidInput' }
  readonly acquire: (
    binding: ModelAdaptationBinding,
    routeName: string,
  ) => { readonly lease: AdaptationLease } | { readonly rejected: 'invalidInput' | 'unavailable' }
  readonly retire: (
    registration: AdaptationRegistration,
    policy: RetirementPolicy,
  ) => Promise<RetirementResult>
  readonly close: (policy: RetirementPolicy) => Promise<RetirementResult>
  /** Only resolves after contributions, executions and the owned connection pool have stopped. */
  readonly closed: Promise<void>
  readonly inspect: () => {
    readonly accepting: boolean
    readonly registrations: number
    readonly retiring: number
    readonly references: number
    readonly executions: number
    readonly cleanupFailures: number
    readonly registryDiagnosticFailures: number | 'unknown'
    readonly registryDiagnosticDropped: number | 'unknown'
  }
}
