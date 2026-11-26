import type { Outcome } from '@omne-harness/operation-result'
import type { OrganizationId, TenantId } from '@omne-harness/legal-identity'
import { judgeMediaType, type Modality } from '@omne-harness/modality'
import type { ContentBlock, ContentReference } from '@omne-harness/content-block'
import type { Message, MessageId } from '@omne-harness/message'
import type { JsonValue } from '@omne-harness/json-text'
import type {
  Access,
  Adoption,
  FixedModelRequest,
  ModelOperationId,
  Parameter,
  ReasoningEffort,
  Revision,
  Supplier,
  ToolDeclaration,
} from './root.ts'
import { REASONING_EFFORTS } from './root.ts'
import type { DurableEvidence, Reply } from './result.ts'
import type { CommitQuery, TransportFailure } from './provider-protocol.ts'
import type { ModelCountingBasis } from './tokenizer.ts'

export type ModelModality = Extract<Modality, 'text' | 'image' | 'voice'>
export type ProfileScope =
  | Readonly<{ kind: 'factory' }>
  | Readonly<{ kind: 'organization'; organization: OrganizationId }>
  | Readonly<{ kind: 'tenant'; tenant: TenantId }>
export type ProfileIdentity = Readonly<{ scope: ProfileScope; route: string }>
export const LIMIT_METRICS = [
  'image-bytes',
  'image-count',
  'request-bytes',
  'voice-bytes',
  'voice-duration-ms',
  'file-bytes',
] as const
export type LimitMetric = (typeof LIMIT_METRICS)[number]
export const OVER_LIMIT_METRICS = ['context-tokens', 'input-tokens', ...LIMIT_METRICS] as const
export type UpstreamLimit =
  | Readonly<{ kind: 'unknown' }>
  | Readonly<{ kind: 'finite'; amount: string; source: Adoption }>
  | Readonly<{ kind: 'unlimited' | 'not-applicable'; source: Adoption }>
export type ModelLimit = Readonly<{
  metric: LimitMetric
  provided: string
  upstream: readonly Readonly<{ supplier: Adoption; limit: UpstreamLimit }>[]
}>
export type TokenLimit = Omit<ModelLimit, 'metric'>
export type ContextLimits = Readonly<{
  window: TokenLimit
  input: TokenLimit | null
  output: TokenLimit
  compactionTriggerPercent: string
}>
export type ForeignThinking = 'omit' | 'text' | 'adapter'
export type ProfileReplay = Readonly<{
  produces?: string
  accepts?: readonly string[]
  foreignThinking?: ForeignThinking
}>
export type ReplayDeclaration = Readonly<{
  produces: string
  accepts: readonly string[]
  foreignThinking: ForeignThinking
}>
export type ProfileSupplier = Omit<Supplier, 'credential'> & Readonly<{ replay?: ProfileReplay }>
export type ReasoningEffortMapping = Readonly<
  Partial<Record<ReasoningEffort, ReasoningEffort | 'max'>>
>
export function supportedReasoningEfforts(
  definition: Pick<ModelProfileDefinition, 'reasoningEfforts'>,
): readonly ReasoningEffort[] {
  return REASONING_EFFORTS.filter(level => definition.reasoningEfforts?.[level] !== undefined)
}
export type ModelProfileDefinition = Readonly<{
  suppliers: readonly [ProfileSupplier, ...ProfileSupplier[]]
  fallback: boolean
  input: readonly [ModelModality, ...ModelModality[]]
  fileTypes?: readonly string[]
  output: readonly [ModelModality, ...ModelModality[]]
  context: ContextLimits
  limits: readonly ModelLimit[]
  parameters: readonly Parameter[]
  reasoningEfforts?: ReasoningEffortMapping
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
  fileTypes?: readonly string[]
  source: DurableEvidence
}>

/** The byte limit one medium is held to: its modality's, or the file one for any other type. */
export function mediaLimitMetric(mediaType: string): 'image-bytes' | 'voice-bytes' | 'file-bytes' {
  const judged = judgeMediaType(mediaType)
  const modality = 'ok' in judged ? judged.ok.modality : null
  return modality === 'image' ? 'image-bytes' : modality === 'voice' ? 'voice-bytes' : 'file-bytes'
}

export function isNativeFileType(value: string): boolean {
  const judged = judgeMediaType(value)
  return 'ok' in judged && judged.ok.mediaType === value && judged.ok.modality === null
}

/** File types are canonical media types of no modality; a profile covers what it takes natively. */
export function profileCovers(
  definition: Pick<ModelProfileDefinition, 'input' | 'fileTypes'>,
  required: Pick<ModalityRequirement, 'modalities' | 'fileTypes'>,
): boolean {
  const input: readonly string[] = definition.input
  const natively = (type: string): boolean => definition.fileTypes?.includes(type) ?? false
  return (
    required.modalities.every(modality => input.includes(modality)) &&
    (required.fileTypes?.every(natively) ?? true)
  )
}
export type ProfileResolution =
  | Readonly<{
      kind: 'resolved'
      profile: ModelProfile
      source: DurableEvidence
      selectable: boolean
      reasons: readonly ('modality' | 'locked' | 'scope' | 'not-enabled')[]
      credential: 'available' | 'missing' | 'unreadable' | 'unavailable'
      shadowed: readonly Adoption[]
      /** The effort the tenant set for this model; the request takes it when the session chose none. */
      defaultReasoningEffort?: ReasoningEffort
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
export type AnchorMiss =
  | 'not-declared'
  | 'call-unreadable'
  | 'facts-unavailable'
  | 'messages-unrecorded'
  | 'ambiguous-dispatch'
  | 'supplier-changed'
  | 'representation-changed'
  | 'not-a-prefix'
  | 'usage-unknown'
  | 'units-missing'
  | 'continuation-shrank'
export type OutputWithheld =
  | 'source-missing'
  | 'source-unreadable'
  | 'source-unavailable'
  | 'ambiguous-dispatch'
  | 'output-unknown'
  | 'reasoning-exceeds-output'
  | 'supplier-changed'
export type MeterCalibration = Readonly<{
  anchor: Readonly<{ covered: readonly MessageId[]; inputTotal: string }> | null
  outputs: readonly (Readonly<{ message: MessageId }> &
    (
      | Readonly<{ kind: 'known'; outputTokens: string }>
      | Readonly<{ kind: 'withheld'; reason: OutputWithheld }>
    ))[]
}>
export type CalibrationReport = Readonly<{
  anchor: Readonly<{ kind: 'hit' }> | Readonly<{ kind: 'miss'; reason: AnchorMiss }>
}>
export type RequestBudget = Readonly<{
  inputDigest: string
  checks: readonly BudgetCheck[]
  counting: readonly [ModelCountingBasis, ...ModelCountingBasis[]]
  calibration?: CalibrationReport
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
  replay?: 'off'
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
  units?: readonly (MessageId | null)[]
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
  ): Promise<Outcome<RequestBudget, TransportFailure>>
}
export interface CalibratedInputMeter extends ModelInputMeter {
  measureCalibrated(
    input: Parameters<ModelInputMeter['measure']>[0],
    calibration: MeterCalibration,
  ): Promise<Outcome<RequestBudget, TransportFailure>>
}
export type ReplayTreatment = Readonly<{
  index: number
  message: MessageId
}> &
  (
    | Readonly<{
        continuable: true
        carry: readonly number[]
        thinking: 'native'
      }>
    | Readonly<{
        continuable: false
        omit: readonly number[]
        thinking: ForeignThinking
      }>
  )
/** Why a reasoning state was left out; never its payload. */
export type ReplayOmission =
  | 'scope'
  | 'format'
  | 'resent'
  | 'no-prefix'
  | 'prefix-history'
  | 'prefix-system'
  | 'prefix-tools'
  | 'prefix-projection'
export type ReplayDiagnostic = Readonly<{
  message: MessageId
  scope: string
  format: string
  omittedParts: number
  reason: ReplayOmission
}>
/** Whether the reasoning state of the receiver holds only on the prefix it was produced on. */
export type ReplayBinding = 'prefix' | 'none'
export type ReplayProjectionInput = Readonly<{
  messages: readonly Message[]
  declaration: ReplayDeclaration
  formats: ReadonlySet<string>
  off: boolean
  resent: ReadonlySet<MessageId>
  system: unknown
  tools: unknown
  binding: ReplayBinding
}>
export type ReplayProjection = Readonly<{
  treatments: readonly ReplayTreatment[]
  diagnostics: readonly ReplayDiagnostic[]
  /** The prefix of the whole request: a reply produced by it records this in its replay mark. */
  prefix: string
}>
