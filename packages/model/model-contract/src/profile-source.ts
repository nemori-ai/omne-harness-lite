import type { MessageId } from '@omne-harness/message'
import type { Access, ModelCallId } from './root.ts'
import type { DurableEvidence, ModelFailure, Reply } from './result.ts'
import type { Supplier } from './root.ts'
import type { ConversionReply, ModelMessageConversion } from './conversion.ts'
import type {
  AssembledModelInput,
  MeterRepresentation,
  ModelInputMeter,
  ModelProfile,
  ParameterAdoption,
  ProfileScope,
} from './profile.ts'
import type { TransportFailure } from './provider-protocol.ts'
import type { Outcome } from '@omne-harness/operation-result'

export type ModelProfileSnapshot = Readonly<{
  precedence: readonly ProfileScope[]
  candidates: readonly Readonly<{
    profile: ModelProfile
    excluded: boolean
    locked: boolean
    credential: 'available' | 'missing' | 'unreadable' | 'unavailable'
  }>[]
  source: DurableEvidence
}>
export interface ModelProfileSource<P> {
  read(input: Access<P>): Reply<ModelProfileSnapshot>
}
export interface ModelRequestRules {
  plan(
    input: Readonly<{
      profile: ModelProfile
      supplier: Supplier
      assembled: AssembledModelInput
    }>,
  ): Outcome<
    Readonly<{
      parameters: readonly ParameterAdoption[]
      representation: MeterRepresentation
    }>,
    TransportFailure
  >
}
export type ModelPreparationLease = Readonly<{
  bindings: readonly [
    Readonly<{
      supplier: Supplier
      rules: ModelRequestRules
      meter: ModelInputMeter
    }>,
    ...Readonly<{ supplier: Supplier; rules: ModelRequestRules; meter: ModelInputMeter }>[],
  ]
  release(): Promise<Readonly<{ failure?: Extract<ModelFailure, { kind: 'unavailable' }> }>>
}>
export type PreparationLineage = Readonly<{
  continues?: ModelCallId
  sources?: readonly Readonly<{ message: MessageId; call: ModelCallId }>[]
}>
export interface ModelPreparationResources<P> {
  acquire(
    input: Access<P> & Readonly<{ profile: ModelProfile; lineage?: PreparationLineage }>,
  ): Reply<ModelPreparationLease>
}
export interface ModelContentAuthority<P> {
  check(input: Parameters<ModelMessageConversion<P>['prepare']>[0]): ConversionReply<
    Readonly<{
      treatment: 'human-only' | 'text' | 'tool-ref' | 'convertible'
    }>
  >
}
