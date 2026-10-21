import type { ContentReference } from '@omne-harness/content-block'
import type { JsonValue } from '@omne-harness/json-text'
import type {
  Adoption,
  MediaMeasurementFact,
  ModelFault,
  Supplier,
  TransportFact,
  TransportFailure,
} from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'
import type {
  PiFamilyBinding,
  PiFamilyContributions,
  PiMaterializedMedia,
  PiProtocolFrame,
  PiResponseDecoder,
} from '@omne-harness/pi-ai-transport'
import { expectTypeOf, it } from 'vitest'

it('US-24: a protocol frame is either a data value or the end marker', () => {
  expectTypeOf<PiProtocolFrame>().toEqualTypeOf<
    Readonly<{ kind: 'data'; value: JsonValue }> | Readonly<{ kind: 'end-marker' }>
  >()
})

it('US-24: a decoder turns frames and the end into transport facts or a model fault', () => {
  expectTypeOf<PiResponseDecoder['accept']>().parameters.toEqualTypeOf<[PiProtocolFrame]>()
  expectTypeOf<ReturnType<PiResponseDecoder['accept']>>().toEqualTypeOf<
    Outcome<readonly TransportFact[], ModelFault>
  >()
  expectTypeOf<ReturnType<PiResponseDecoder['end']>>().toEqualTypeOf<
    Outcome<readonly TransportFact[], ModelFault>
  >()
})

it('US-24: materialized media lends bytes with its reference and measurement', () => {
  expectTypeOf<PiMaterializedMedia>().toEqualTypeOf<
    Readonly<{
      reference: ContentReference
      mime: string
      bytes: Uint8Array
      measurement: MediaMeasurementFact
    }>
  >()
})

it('US-24: a binding fixes supplier and adoption and owns its release', () => {
  expectTypeOf<PiFamilyBinding['supplier']>().toEqualTypeOf<Supplier>()
  expectTypeOf<PiFamilyBinding['adoption']>().toEqualTypeOf<Adoption>()
  expectTypeOf<PiFamilyBinding['createDecoder']>().returns.toEqualTypeOf<PiResponseDecoder>()
  expectTypeOf<PiFamilyBinding['release']>().returns.toEqualTypeOf<Promise<void>>()
})

it('US-24: acquire selects one supplier under a cancel signal', () => {
  expectTypeOf<PiFamilyContributions['acquire']>().parameters.toEqualTypeOf<
    [Supplier, AbortSignal]
  >()
  expectTypeOf<PiFamilyContributions['acquire']>().returns.toEqualTypeOf<
    Promise<Outcome<PiFamilyBinding, TransportFailure>>
  >()
})
