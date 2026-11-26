import type { EngineEndpoint, ProviderEndpoint, RouteAccounting } from './config.ts'
import type { Outcome } from '@omne-harness/operation-result'
import type { JsonValue } from '@omne-harness/json-text'
import type { ContentReference } from '@omne-harness/content-block'
import type {
  Adoption,
  Supplier,
  FixedModelRequest,
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
export type PiFamilyBinding = Readonly<{
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
      request: FixedModelRequest
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
    input: Readonly<{ request: FixedModelRequest; accounting: RouteAccounting }>,
  ): PiResponseDecoder
  release(): Promise<void>
}>
type Encoded = Extract<ReturnType<PiFamilyBinding['encode']>, { ok: unknown }>['ok']
/** What one dispatch needs of a binding: where it goes, how the request is written, how the answer is read. */
export type PiSendBinding = Pick<
  PiFamilyBinding,
  'adoption' | 'mediaLimits' | 'replayFormat' | 'createDecoder' | 'release'
> &
  Readonly<{
    endpoint: ProviderEndpoint
    encode(
      input: Parameters<PiFamilyBinding['encode']>[0],
    ): Outcome<Omit<Encoded, 'representation'>, TransportFailure>
  }>
export interface PiFamilyContributions {
  acquire(
    supplier: Supplier,
    signal: AbortSignal,
  ): Promise<Outcome<PiFamilyBinding, TransportFailure>>
}
