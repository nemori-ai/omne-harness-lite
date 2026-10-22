import type { ContentReference } from '@omne-harness/content-block'
import type { JsonValue } from '@omne-harness/json-text'
import type {
  Adoption,
  MediaMeasurementFact,
  ModelFault,
  ModelTransport,
  Supplier,
  TransportFact,
  TransportFailure,
} from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'
import {
  createNetworkResources,
  createPiTransport,
  type DiagnosticObserver,
  type NetworkConfig,
  type NetworkResources,
  type PiCredentialSlot,
  type PiRoute,
  type PiTransportConfig,
  type ProxyConfig,
} from '@omne-harness/pi-ai-transport'
import type {
  PiFamilyBinding,
  PiFamilyContributions,
  PiMaterializedMedia,
  PiProtocolFrame,
  PiResponseDecoder,
} from '@omne-harness/pi-ai-transport'
import { expectTypeOf, it } from 'vitest'

it('a protocol frame is either a data value or the end marker', () => {
  expectTypeOf<PiProtocolFrame>().toEqualTypeOf<
    Readonly<{ kind: 'data'; value: JsonValue }> | Readonly<{ kind: 'end-marker' }>
  >()
})

it('a decoder turns frames and the end into transport facts or a model fault', () => {
  expectTypeOf<PiResponseDecoder['accept']>().parameters.toEqualTypeOf<[PiProtocolFrame]>()
  expectTypeOf<ReturnType<PiResponseDecoder['accept']>>().toEqualTypeOf<
    Outcome<readonly TransportFact[], ModelFault>
  >()
  expectTypeOf<ReturnType<PiResponseDecoder['end']>>().toEqualTypeOf<
    Outcome<readonly TransportFact[], ModelFault>
  >()
})

it('materialized media lends bytes with its reference and measurement', () => {
  expectTypeOf<PiMaterializedMedia>().toEqualTypeOf<
    Readonly<{
      reference: ContentReference
      mime: string
      bytes: Uint8Array
      measurement: MediaMeasurementFact
    }>
  >()
})

it('a binding fixes supplier and adoption and owns its release', () => {
  expectTypeOf<PiFamilyBinding['supplier']>().toEqualTypeOf<Supplier>()
  expectTypeOf<PiFamilyBinding['adoption']>().toEqualTypeOf<Adoption>()
  expectTypeOf<PiFamilyBinding['createDecoder']>().returns.toEqualTypeOf<PiResponseDecoder>()
  expectTypeOf<PiFamilyBinding['release']>().returns.toEqualTypeOf<Promise<void>>()
})

it('acquire selects one supplier under a cancel signal', () => {
  expectTypeOf<PiFamilyContributions['acquire']>().parameters.toEqualTypeOf<
    [Supplier, AbortSignal]
  >()
  expectTypeOf<PiFamilyContributions['acquire']>().returns.toEqualTypeOf<
    Promise<Outcome<PiFamilyBinding, TransportFailure>>
  >()
})

it('the factory takes the configuration and gives a model transport with its own close', () => {
  expectTypeOf(createPiTransport).parameters.toEqualTypeOf<[PiTransportConfig]>()
  expectTypeOf(createPiTransport).returns.toEqualTypeOf<
    Readonly<{ transport: ModelTransport; close(): Promise<void> }>
  >()
})

it('a route names its endpoint and end marker, and the credential slot reads a secret or nothing', () => {
  expectTypeOf<PiRoute>().toEqualTypeOf<Readonly<{ url: string; endMarker: string | null }>>()
  expectTypeOf<PiCredentialSlot['read']>().returns.toEqualTypeOf<string | undefined>()
  expectTypeOf<PiTransportConfig['routes']>().toEqualTypeOf<Readonly<Record<string, PiRoute>>>()
})

it('the network resources factory gives the resources that the transport configuration takes', () => {
  expectTypeOf(createNetworkResources).parameters.toEqualTypeOf<[NetworkConfig]>()
  expectTypeOf(createNetworkResources).returns.toEqualTypeOf<NetworkResources>()
  expectTypeOf<PiTransportConfig['network']>().toEqualTypeOf<NetworkResources>()
  expectTypeOf<NetworkResources['close']>().returns.toEqualTypeOf<Promise<void>>()
})

it('the network configuration names its proxy and its diagnostics observer with exported types', () => {
  expectTypeOf<NetworkConfig['proxy']>().toEqualTypeOf<ProxyConfig | undefined>()
  expectTypeOf<ProxyConfig>().toEqualTypeOf<Readonly<{ url: string; bypass: readonly string[] }>>()
  expectTypeOf<NonNullable<NetworkConfig['diagnostics']>>().toEqualTypeOf<
    Readonly<{ observer: DiagnosticObserver; maxPending: number }>
  >()
})
