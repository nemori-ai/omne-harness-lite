// The accepted pi family contribution interface. The shapes are copied verbatim from
// packages/model/docs/architecture.md, section "pi 家族贡献的取得协议"; change them there first.
import type { Outcome } from '@omne-harness/operation-result'
import type { JsonValue } from '@omne-harness/json-text'
import type { ContentReference } from '@omne-harness/content-block'
import type {
  Adoption,
  Supplier,
  FixedModelRequest,
  ModelRequestRules,
  ModelInputMeter,
  ModelCountingBasis,
  ModelToolPayloadAdapter,
  TransportFact,
  TransportFailure,
  ModelFault,
  MeterRepresentation,
  MediaMeasurementFact,
} from '@omne-harness/model-contract'

export type PiProtocolFrame =
  | Readonly<{ kind: 'data'; value: JsonValue }>
  | Readonly<{ kind: 'end-marker' }>
export interface PiResponseDecoder {
  accept(frame: PiProtocolFrame): Outcome<readonly TransportFact[], ModelFault>
  end(): Outcome<readonly TransportFact[], ModelFault>
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
  counting: ModelCountingBasis
  rules: ModelRequestRules
  meter: ModelInputMeter
  tools: ModelToolPayloadAdapter<JsonValue>
  encode(
    input: Readonly<{
      request: FixedModelRequest
      media: readonly PiMaterializedMedia[]
    }>,
  ): Outcome<
    Readonly<{
      body: JsonValue
      representation: Extract<MeterRepresentation, { kind: 'materialized' }>
    }>,
    TransportFailure
  >
  createDecoder(): PiResponseDecoder
  release(): Promise<void>
}>
export interface PiFamilyContributions {
  acquire(
    supplier: Supplier,
    signal: AbortSignal,
  ): Promise<Outcome<PiFamilyBinding, TransportFailure>>
}
