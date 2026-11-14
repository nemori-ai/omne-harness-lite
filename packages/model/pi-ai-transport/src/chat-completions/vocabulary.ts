import type { ContentBlock } from '@omne-harness/content-block'
import type { JsonLimits, JsonValue } from '@omne-harness/json-text'
import type {
  Adoption,
  FixedModelRequest,
  MeterRepresentation,
  ModelFault,
  Parameter,
  ProfileReplay,
  ToolDeclaration,
  TransportFailure,
} from '@omne-harness/model-contract'
import type {
  CalibratedInputMeter,
  ProviderDiagnostic,
  ReplayTreatment,
  TransportFact,
} from '@omne-harness/model-contract/provider'
import type { Outcome } from '@omne-harness/operation-result'
import type { PiModelRecordHead } from '../family-table.ts'

export type ChatMessage = FixedModelRequest['messages'][number]
export type ChatMessageId = ChatMessage['id']
export type ChatUsageItem = Extract<TransportFact, { kind: 'account' }>['value']['usage'][number]
export type UsageDiagnostic = Extract<ProviderDiagnostic, { kind: 'usage-inconsistent' }>
export type ChatUsage = Readonly<{
  items: readonly ChatUsageItem[]
  diagnostics: readonly UsageDiagnostic[]
}>
export type ProjectedPart = Exclude<ChatMessage['blocks'][number], { kind: 'reasoning_state' }>

export type GatewayParam =
  | Readonly<{
      field: 'temperature' | 'top_p' | 'frequency_penalty' | 'presence_penalty'
      value: number
    }>
  | Readonly<{ field: 'max_tokens' | 'seed'; value: string }>
  | Readonly<{ field: 'stop'; value: readonly string[] }>
  | Readonly<{
      field: 'reasoning.effort'
      value: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
    }>
  | Readonly<{ field: 'store'; value: false }>

export type GatewayField = GatewayParam['field']

export type WireProfile = Readonly<{
  roles: Readonly<{
    instruction: 'system' | 'developer'
    reminder: 'system' | 'developer' | 'user'
  }>
  content: 'compact' | 'parts'
  cache: Readonly<{ kind: 'none' }> | Readonly<{ kind: 'last-message'; ttl: '5m' | '1h' }>
  image: Readonly<{
    mediaTypes: readonly string[]
    detail: 'low' | 'high' | 'auto'
  }> | null
  fixed: readonly GatewayParam[]
  usageTail: Readonly<{ maxFrames: number }>
  toolNames: Readonly<{ rule: 'underscore/1'; maxLength: number }>
}>

export type ServingPin = Readonly<{
  order: readonly [string, ...string[]]
  reports: readonly [string, ...string[]]
}>

export type ParameterKind = Exclude<Parameter['kind'], 'extension'>
export type ParameterValue<K extends ParameterKind> = Extract<Parameter, { kind: K }>['value']

export type ParameterAccept<K extends ParameterKind> = K extends
  | 'temperature'
  | 'top-p'
  | 'frequency-penalty'
  | 'presence-penalty'
  ? Readonly<{ min: number; max: number }>
  : K extends 'max-output-tokens'
    ? Readonly<{ max: string }>
    : K extends 'stop'
      ? Readonly<{ maxItems: number; maxLength: number }>
      : Readonly<Record<string, never>>

export type FieldsOfValue<V> = GatewayParam extends infer P
  ? P extends GatewayParam
    ? [V] extends [P['value']]
      ? [P['value']] extends [V]
        ? P['field']
        : never
      : never
    : never
  : never

export type ParameterWire<K extends ParameterKind> = K extends 'reasoning-effort'
  ? Readonly<Record<ParameterValue<'reasoning-effort'>, GatewayParam | 'unsupported'>>
  : Readonly<{ field: FieldsOfValue<ParameterValue<K>> }>

export type ParameterRule<K extends ParameterKind> =
  | Readonly<{ support: 'unsupported' }>
  | Readonly<{
      support: 'supported'
      default: Readonly<{ kind: 'send'; value: ParameterValue<K> }> | Readonly<{ kind: 'absent' }>
      accept: ParameterAccept<K>
      wire: ParameterWire<K>
    }>

export type ParameterTable = Readonly<{ [K in ParameterKind]: ParameterRule<K> }>

export type ExtensionRule = Readonly<{ definition: Adoption; field: GatewayField }>

export type ChatCompletionsRecord = PiModelRecordHead &
  Readonly<{
    serving: ServingPin
    wire: WireProfile
    parameters: ParameterTable
    extensions: readonly ExtensionRule[]
    replay: Readonly<{
      declaration: ProfileReplay
      formats: Readonly<{ produces: string; accepts: readonly string[] }>
    }>
  }>

export type ChatCompletionsLimits = Readonly<{
  toolArguments: JsonLimits
  maxReasoningText: number
}>

export type ReasoningDetail = Readonly<{
  type: 'reasoning.text' | 'reasoning.summary' | 'reasoning.encrypted' | 'other'
  format: string | null
  raw: Readonly<Record<string, JsonValue>>
}>

export type ReplayWire =
  | Readonly<{ kind: 'details'; details: readonly Readonly<Record<string, JsonValue>>[] }>
  | Readonly<{ kind: 'plain'; text: string }>
  | Readonly<{ kind: 'none' }>

export type ReplayPart = Readonly<{ payload: string; format: string }>

export type ReplaySource = 'continuable' | 'foreign'

export type ReasoningCodec = Readonly<{
  seal(
    details: readonly ReasoningDetail[],
  ): Outcome<readonly Readonly<{ payload: string }>[], ModelFault>
  replay(
    parts: readonly ReplayPart[],
    thinking: readonly string[],
    source: ReplaySource,
  ): Outcome<ReplayWire, TransportFailure>
}>

export type GatewayUsage = Readonly<{
  promptTokens: string | null
  completionTokens: string | null
  cachedTokens: string | null
  reasoningTokens: string | null
  raw: Readonly<Record<string, JsonValue>>
}>

export type VendorHooks = Readonly<{
  reasoning: ReasoningCodec | null
  usage(usage: GatewayUsage): Outcome<ChatUsage, ModelFault>
  toolSchema(schema: JsonValue): Outcome<JsonValue, TransportFailure>
  check(
    input: Readonly<{
      applied: readonly Parameter[]
      messages: readonly ChatMessage[]
      treatments: readonly ReplayTreatment[]
    }>,
  ): Outcome<void, TransportFailure>
}>

export type ProjectedTurn = Readonly<{
  message: ChatMessageId
  role: 'system' | 'developer' | 'user' | 'assistant' | 'tool'
  blocks: readonly ProjectedPart[]
  replay: ReplayWire
}>

export type ProjectedRequest = Readonly<{
  instruction: readonly ContentBlock[]
  turns: readonly ProjectedTurn[]
  tools: readonly ToolDeclaration[]
  toolChoice: FixedModelRequest['toolChoice']
  applied: readonly Parameter[]
}>

export type MeterUnits = NonNullable<MeterRepresentation['units']>

export type FamilyMeter = Readonly<{
  instance: CalibratedInputMeter
  represent(
    view: ProjectedRequest,
  ): Readonly<{ adoption: Adoption; tokenInput: JsonValue; units: MeterUnits }>
}>
