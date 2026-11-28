import {
  PROTOCOLS,
  type DecisionsEndpoint,
  type LiveEndpoint,
  type EngineEndpoint,
  type ProviderEndpoint,
  type RouteAccounting,
} from './config.ts'
import type { Outcome } from '@omne-harness/operation-result'
import type { JsonValue } from '@omne-harness/json-text'
import type { ContentReference } from '@omne-harness/content-block'
import type {
  Adoption,
  Supplier,
  LlmModelRequest,
  ModelKind,
  ModelRequestRules,
  ModelCountingBasis,
  TransportFailure,
  ModelFault,
  MeterRepresentation,
  MediaMeasurementFact,
  ReplayDeclaration,
} from '@omne-harness/model-contract'
import type {
  ModelMediaLimits,
  CalibratedInputMeter,
  ModelToolPayloadAdapter,
  TransportFact,
  TransportDispatch,
  ProviderDiagnostic,
} from '@omne-harness/model-contract/provider'

export type PiProtocolFrame =
  | Readonly<{ kind: 'data'; value: JsonValue }>
  | Readonly<{ kind: 'end-marker' }>
export interface PiResponseDecoder {
  accept(frame: PiProtocolFrame): Outcome<readonly TransportFact[], ModelFault>
  end(): Outcome<readonly TransportFact[], ModelFault>
  /** The fault of a refused request when the engine recognizes the refusal; null leaves it to the status. */
  refused?(status: number, body: string): ModelFault | null
}
export type PiMaterializedMedia = Readonly<{
  reference: ContentReference
  mime: string
  bytes: Uint8Array
  measurement: MediaMeasurementFact
}>
export type PiChatBinding = Readonly<{
  supplier: Supplier
  adoption: Adoption
  /** What this model takes of a referenced medium; null: it takes none of this kind. */
  mediaLimits(reference: ContentReference): ModelMediaLimits | null
  counting: ModelCountingBasis
  rules: ModelRequestRules
  meter: CalibratedInputMeter
  /** The gateway interface this binding encodes for; the route gives its address. */
  endpoint: EngineEndpoint
  replayFormat: string | null
  tools: ModelToolPayloadAdapter<JsonValue>
  encode(
    input: Readonly<{
      request: LlmModelRequest
      media: readonly PiMaterializedMedia[]
      declaration: ReplayDeclaration
      resent: TransportDispatch['resent']
    }>,
  ): Outcome<
    Readonly<{
      body: JsonValue
      representation: Extract<MeterRepresentation, { kind: 'materialized' }>
      diagnostics: readonly ProviderDiagnostic[]
      /** The prefix of this request; a reply it produces records it in its replay mark. */
      replayPrefix: string
      /** Whether the request carries reasoning state back. */
      replayCarried: boolean
    }>,
    TransportFailure
  >
  createDecoder(
    input: Readonly<{ request: LlmModelRequest; accounting: RouteAccounting }>,
  ): PiResponseDecoder
  release(): Promise<void>
}>
export type PiDecisionsBinding = Readonly<{
  supplier: Supplier
  adoption: Adoption
  endpoint: DecisionsEndpoint
  maxQuestions: number | null
  release(): Promise<void>
}>
export type PiLiveBinding = Readonly<{
  supplier: Supplier
  adoption: Adoption
  endpoint: LiveEndpoint
  release(): Promise<void>
}>
export type PiFamilyBinding = PiChatBinding | PiDecisionsBinding | PiLiveBinding
type EndpointOf<K extends ModelKind> = {
  [E in ProviderEndpoint]: (typeof PROTOCOLS)[E]['kind'] extends K ? E : never
}[ProviderEndpoint]
/** Whether a binding serves a kind of model; the table of interfaces answers, not the name of the interface. */
export function isBindingOf<K extends ModelKind>(
  binding: PiFamilyBinding,
  kind: K,
): binding is Extract<PiFamilyBinding, Readonly<{ endpoint: EndpointOf<K> }>> {
  return PROTOCOLS[binding.endpoint].kind === kind
}
export interface PiFamilyContributions<B extends PiFamilyBinding = PiFamilyBinding> {
  acquire(supplier: Supplier, signal: AbortSignal): Promise<Outcome<B, TransportFailure>>
}

export function chatBindingsOf(families: PiFamilyContributions): Readonly<{
  acquire(
    supplier: Supplier,
    signal: AbortSignal,
  ): Promise<Outcome<PiChatBinding, TransportFailure>>
}> {
  return {
    async acquire(supplier, signal) {
      const acquired = await families.acquire(supplier, signal)
      if (!('ok' in acquired)) return acquired
      const binding = acquired.ok
      if (isBindingOf(binding, 'llm')) return { ok: binding }
      await binding.release()
      return { failure: { kind: 'unsupported', field: 'supplier', adapter: binding.adoption } }
    },
  }
}
