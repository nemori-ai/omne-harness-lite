// Declarations of the public-api chapter "档案与请求准备".
// AssembledModelInput, ModelRequestPreparation and ModelInputMeter carry Message, which the shared
// message package already exports, so they are declared here.
import type { Outcome } from '@omne-harness/operation-result'
import type { TenantId } from '@omne-harness/legal-identity'
import type { Modality } from '@omne-harness/modality'
import type { ContentBlock, ContentReference } from '@omne-harness/content-block'
import type { Message } from '@omne-harness/message'
import type { JsonValue } from '@omne-harness/json-text'
import type {
  Access,
  Adoption,
  FixedModelRequest,
  ModelOperationId,
  Parameter,
  Revision,
  Supplier,
  ToolDeclaration,
} from './root.ts'
import type { DurableEvidence, Reply } from './result.ts'
import type { CommitQuery, TransportFailure } from './provider.ts'
import type { ModelCountingBasis } from './tokenizer.ts'

/** The modalities of the shared vocabulary that this phase of Model supports. */
export type ModelModality = Extract<Modality, 'text' | 'image' | 'voice'>
export type ProfileScope =
  | Readonly<{ kind: 'factory' }>
  | Readonly<{ kind: 'organization'; organization: string }>
  | Readonly<{ kind: 'tenant'; tenant: TenantId }>
export type ProfileIdentity = Readonly<{ scope: ProfileScope; route: string }>
export type LimitMetric =
  | 'image-bytes'
  | 'image-count'
  | 'request-bytes'
  | 'voice-bytes'
  | 'voice-duration-ms'
export type UpstreamLimit =
  | Readonly<{ kind: 'unknown' }>
  | Readonly<{ kind: 'finite'; amount: string; source: Adoption }>
  | Readonly<{ kind: 'unlimited' | 'not-applicable'; source: Adoption }>
export type ModelLimit = Readonly<{
  metric: LimitMetric
  provided: string
  upstream: readonly Readonly<{ supplier: Adoption; limit: UpstreamLimit }>[]
}>
/** A token limit of `context`: a provided value with its upstream evidence, without a metric. */
export type TokenLimit = Omit<ModelLimit, 'metric'>
export type ContextLimits = Readonly<{
  window: TokenLimit
  input: TokenLimit | null
  output: TokenLimit
  compactionTriggerPercent: string
}>
export type ProfileSupplier = Omit<Supplier, 'credential'>
export type ModelProfileDefinition = Readonly<{
  suppliers: readonly [ProfileSupplier, ...ProfileSupplier[]]
  fallback: boolean
  input: readonly [ModelModality, ...ModelModality[]]
  output: readonly [ModelModality, ...ModelModality[]]
  context: ContextLimits
  limits: readonly ModelLimit[]
  parameters: readonly Parameter[]
  representation: Adoption
  meter: Adoption
  retryPolicy: Adoption
}>
export type ModelProfile = Readonly<{
  identity: ProfileIdentity
  adoption: Adoption
  revision: Revision
  updatedAt: string
  availability: 'active' | 'withdrawn'
  definition: ModelProfileDefinition
}>
export type ModalityRequirement = Readonly<{
  modalities: readonly [Modality, ...Modality[]]
  source: DurableEvidence
}>
export type ProfileResolution =
  | Readonly<{
      kind: 'resolved'
      profile: ModelProfile
      source: DurableEvidence
      selectable: boolean
      reasons: readonly ('modality' | 'locked' | 'scope')[]
      credential: 'available' | 'missing' | 'unreadable' | 'unavailable'
      shadowed: readonly Adoption[]
    }>
  | Readonly<{ kind: 'absent'; reason: 'unknown-name' | 'withdrawn' | 'excluded' }>
export type ModelChoices = Readonly<{
  choices: readonly ProfileResolution[]
  selected: Readonly<{ route: string; resolution: ProfileResolution }> | null
  source: DurableEvidence
}>
export interface ModelProfiles<P> {
  list(
    input: Access<P> &
      Readonly<{
        selected: string | null
        required: ModalityRequirement
      }>,
  ): Reply<ModelChoices>
  resolve(
    input: Access<P> &
      Readonly<{
        route: string
        required: ModalityRequirement
      }>,
  ): Reply<ProfileResolution>
}
export type ProfileChange =
  | Readonly<{ kind: 'create'; identity: ProfileIdentity; definition: ModelProfileDefinition }>
  | Readonly<{
      kind: 'revise'
      identity: ProfileIdentity
      expected: Revision
      definition: ModelProfileDefinition
    }>
  | Readonly<{ kind: 'withdraw' | 'restore'; identity: ProfileIdentity; expected: Revision }>
export interface ModelProfileMaintenance<P> {
  change(
    input: Access<P> &
      Readonly<{
        operation: ModelOperationId
        change: ProfileChange
      }>,
  ): Reply<ModelProfile>
  inspect(
    input: Access<P> &
      Readonly<{
        operation: ModelOperationId
      }>,
  ): Reply<CommitQuery<ModelProfile>>
}
export type ParameterAdoption = Readonly<{
  supplier: Adoption
  applied: Parameter
  origin:
    | Readonly<{ kind: 'explicit'; requested: Parameter; source: Adoption }>
    | Readonly<{ kind: 'default'; source: Adoption }>
}>
export type Measurement =
  | Readonly<{ kind: 'exact' | 'upper-bound'; amount: string; method: Adoption }>
  | Readonly<{
      kind: 'estimate'
      amount: string
      margin: string
      method: Adoption
      marginSource: Adoption
    }>
export type BudgetCheck = Readonly<{
  supplier: Adoption
  metric: 'input-tokens' | LimitMetric
  subject: string
  measurement: Measurement
  limit: string
  constraint: Readonly<{ profile: Adoption; upstream: UpstreamLimit }>
}>
export type RequestBudget = Readonly<{
  inputDigest: string
  checks: readonly BudgetCheck[]
  counting: readonly [ModelCountingBasis, ...ModelCountingBasis[]]
}> &
  (
    | Readonly<{ kind: 'complete' }>
    | Readonly<{
        kind: 'deferred-media'
        references: readonly [ContentReference, ...ContentReference[]]
      }>
  )
export type AssembledModelInput = Readonly<{
  system: readonly ContentBlock[]
  messages: readonly Message[]
  tools: readonly ToolDeclaration[]
  toolChoice: FixedModelRequest['toolChoice']
  parameters: readonly Parameter[]
  representation: Adoption
  source: Adoption
}>
export interface ModelRequestPreparation<P> {
  prepare(
    input: Access<P> &
      Readonly<{
        profile: ModelProfile
        required: ModalityRequirement
        assembled: AssembledModelInput
      }>,
  ): Reply<FixedModelRequest>
}
export type MediaMeasurementFact = Readonly<{
  reference: ContentReference
  bytes: string
  mediaType: string
}> &
  (
    | Readonly<{ kind: 'image'; widthPixels: string; heightPixels: string }>
    | Readonly<{ kind: 'voice'; durationMs: string; sampleRate: string; channels: string }>
    | Readonly<{ kind: 'file' }>
  )
export type MeterRepresentation = Readonly<{
  adoption: Adoption
  tokenInput: JsonValue
  media: readonly MediaMeasurementFact[]
}> &
  (
    | Readonly<{
        kind: 'pending-media'
        references: readonly [ContentReference, ...ContentReference[]]
      }>
    | Readonly<{ kind: 'materialized'; requestBytes: string }>
  )
export interface ModelInputMeter {
  readonly basis: ModelCountingBasis
  measure(
    input: Readonly<{
      profile: Adoption
      supplier: ProfileSupplier
      context: ContextLimits
      limits: readonly ModelLimit[]
      assembled: AssembledModelInput
      parameters: readonly ParameterAdoption[]
      representation: MeterRepresentation
    }>,
  ): Outcome<RequestBudget, TransportFailure>
}
