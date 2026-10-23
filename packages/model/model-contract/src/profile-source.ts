// Declarations of the public-api chapter "档案来源与准备资源".
// ModelPreparationLease and ModelPreparationResources carry Message through the meter and rules.
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
import type { TransportFailure } from './provider.ts'
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
  /** Gives the lease back. A failed release hook comes back as `failure`; a throw means a program defect. */
  release(): Promise<Readonly<{ failure?: Extract<ModelFailure, { kind: 'unavailable' }> }>>
}>
/**
 * What the request assembler declares about the calls behind one request, once per lease. The
 * assembler vouches for the preconditions of `continues` in SPEC "lineage 的声明与前置条件"; Model
 * does not detect a violation, and the declarer owns the result. The lease verifies only the facts
 * Model owns and never compares message content.
 */
export type PreparationLineage = Readonly<{
  /** The call whose real input this request continues. */
  continues?: ModelCallId
  /** The call that produced each assistant message that carries reasoning state. */
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
