import type { Outcome } from '@omne-harness/operation-result'
import type { OrganizationId, TenantId } from '@omne-harness/legal-identity'
import { judgeMediaType, type Modality } from '@omne-harness/modality'
import type { ContentBlock, ContentReference } from '@omne-harness/content-block'
import type { Message, MessageId } from '@omne-harness/message'
import type { JsonValue } from '@omne-harness/json-text'
import type {
  Access,
  Adoption,
  LlmModelRequest,
  LlmRequest,
  ModelOperationId,
  Parameter,
  ReasoningEffort,
  Revision,
  Supplier,
  ToolDeclaration,
} from './root.ts'
import { REASONING_EFFORTS } from './root.ts'
import type { ModelKind } from './model-kind.ts'
import type { DurableEvidence, Reply } from './result.ts'
import type { CommitQuery, TransportFailure } from './provider-protocol.ts'
import type { ModelCountingBasis } from './tokenizer.ts'

export type ModelModality = Extract<Modality, 'text' | 'image' | 'voice'>
export type ProfileScope =
  | Readonly<{ kind: 'factory' }>
  | Readonly<{ kind: 'organization'; organization: OrganizationId }>
  | Readonly<{ kind: 'tenant'; tenant: TenantId }>
export type ProfileIdentity = Readonly<{ scope: ProfileScope; kind: ModelKind; route: string }>
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
  definition: Pick<LlmProfile, 'reasoningEfforts'>,
): readonly ReasoningEffort[] {
  return REASONING_EFFORTS.filter(level => definition.reasoningEfforts?.[level] !== undefined)
}
export type ProfileCommon = Readonly<{
  suppliers: readonly [ProfileSupplier, ...ProfileSupplier[]]
  fallback: boolean
  input: readonly [ModelModality, ...ModelModality[]]
  output: readonly [ModelModality, ...ModelModality[]]
  retryPolicy: Adoption
}>
export type LlmProfile = Readonly<{
  kind: 'llm'
  fileTypes?: readonly string[]
  context: ContextLimits
  limits: readonly ModelLimit[]
  parameters: readonly Parameter[]
  reasoningEfforts?: ReasoningEffortMapping
  representation: Adoption
  meter: Adoption
}>
export type DecisionsProfile = Readonly<{ kind: 'decisions'; maxQuestions: string | null }>
export type LiveProfile = Readonly<{
  kind: 'live'
  voices: readonly string[]
  audioFormats: readonly [string, ...string[]]
  maxSessionSeconds: string | null
}>
export type ProfileKind = ModelKind
export type ModelProfileDefinition<K extends ProfileKind = ProfileKind> = Readonly<{
  llm: ProfileCommon & LlmProfile
  decisions: ProfileCommon & DecisionsProfile
  live: ProfileCommon & LiveProfile
}>[K]
export type ModelProfile<K extends ProfileKind = ProfileKind> = Readonly<{
  identity: ProfileIdentity
  adoption: Adoption
  revision: Revision
  updatedAt: string
  availability: 'active' | 'withdrawn'
  definition: ModelProfileDefinition<K>
}>
export function isProfileOf<K extends ProfileKind>(
  profile: ModelProfile,
  kind: K,
): profile is ModelProfile<K> {
  return profile.definition.kind === kind
}
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

export type ModelNeed<K extends ProfileKind = ProfileKind> = Readonly<{
  kind: K
  modalities?: Readonly<{ input?: readonly Modality[]; output?: readonly Modality[] }>
  fileTypes?: readonly string[]
  source: DurableEvidence
}>

export function chatNeedOf(content: ModalityRequirement): ModelNeed<'llm'> {
  const { modalities, fileTypes, source } = content
  return {
    kind: 'llm',
    modalities: { input: modalities },
    ...(fileTypes === undefined ? {} : { fileTypes }),
    source,
  }
}

/** Whether a profile meets a need: it takes and gives every modality asked, and takes the file types natively. */
export function meetsNeed(definition: ModelProfileDefinition, need: ModelNeed): boolean {
  if (definition.kind !== need.kind) return false
  const natively = definition.kind === 'llm' ? definition.fileTypes : undefined
  return (
    holdsAll(definition.input, need.modalities?.input) &&
    holdsAll(definition.output, need.modalities?.output) &&
    holdsAll(natively, need.fileTypes)
  )
}

const holdsAll = (held: readonly string[] | undefined, asked: readonly string[] | undefined) =>
  asked === undefined || asked.every(item => held?.includes(item) === true)
export type ProfileResolution<K extends ProfileKind = ProfileKind> =
  | Readonly<{
      kind: 'resolved'
      profile: ModelProfile<K>
      source: DurableEvidence
      selectable: boolean
      reasons: readonly ('modality' | 'locked' | 'scope' | 'not-enabled')[]
      credential: 'available' | 'missing' | 'unreadable' | 'unavailable'
      shadowed: readonly Adoption[]
      /** The effort the tenant set for this model; the request takes it when the session chose none. */
      defaultReasoningEffort?: ReasoningEffort
    }>
  | Readonly<{ kind: 'absent'; reason: 'unknown-name' | 'withdrawn' | 'excluded' }>
export type ModelChoices<K extends ProfileKind = ProfileKind> = Readonly<{
  choices: readonly ProfileResolution<K>[]
  selected: Readonly<{ route: string; resolution: ProfileResolution<K> }> | null
  source: DurableEvidence
}>
export type ProfileListInput<P, K extends ProfileKind = ProfileKind> = Access<P> &
  Readonly<{ selected: string | null; required: ModelNeed<K> }>
export type ProfileResolveInput<P, K extends ProfileKind = ProfileKind> = Access<P> &
  Readonly<{ route: string; required: ModelNeed<K> }>
export interface ModelProfiles<P> {
  list<K extends ProfileKind>(input: ProfileListInput<P, K>): Reply<ModelChoices<K>>
  resolve<K extends ProfileKind>(input: ProfileResolveInput<P, K>): Reply<ProfileResolution<K>>
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
  toolChoice: LlmRequest['toolChoice']
  parameters: readonly Parameter[]
  replay?: 'off'
  representation: Adoption
  source: Adoption
}>
export interface ModelRequestPreparation<P> {
  prepare(
    input: Access<P> &
      Readonly<{
        profile: ModelProfile<'llm'>
        required: ModalityRequirement
        assembled: AssembledModelInput
      }>,
  ): Reply<LlmModelRequest>
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
