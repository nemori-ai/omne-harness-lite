// The vocabulary of the gateway engine: the record data the engine reads, the four hooks a family
// gives, and the projection that encode and the meter share. The engine knows no vendor: every
// vendor difference is a value of a record or one of the four hooks.
import type { ContentBlock } from '@omne-harness/content-block'
import type { JsonLimits, JsonValue } from '@omne-harness/json-text'
import type {
  Adoption,
  FixedModelRequest,
  ModelFault,
  ModelInputMeter,
  Parameter,
  ProfileReplay,
  ReplayTreatment,
  ToolDeclaration,
  TransportFact,
  TransportFailure,
} from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'
import type { PiModelRecordHead } from '../family-table.ts'

/** A message of the shared log, as the contract carries it. */
export type ChatMessage = FixedModelRequest['messages'][number]
/** The identity of a message. */
export type ChatMessageId = ChatMessage['id']
/** One usage item of a call account. */
export type ChatUsageItem = Extract<TransportFact, { kind: 'account' }>['value']['usage'][number]
/** A part of a message other than a reasoning state part. */
export type ProjectedPart = Exclude<ChatMessage['blocks'][number], { kind: 'reasoning_state' }>

/**
 * The gateway request fields the engine can write. A closed vocabulary: a new field changes the
 * engine. A field with a dot is nested: `reasoning.effort` is `{"reasoning":{"effort":…}}`.
 */
export type GatewayParam =
  | Readonly<{
      field: 'temperature' | 'top_p' | 'frequency_penalty' | 'presence_penalty'
      value: number
    }>
  /** Decimal integer text, written as a JSON number with the same lexeme. */
  | Readonly<{ field: 'max_tokens' | 'seed'; value: string }>
  | Readonly<{ field: 'stop'; value: readonly string[] }>
  | Readonly<{
      field: 'reasoning.effort'
      value: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
    }>
  /** The engine writes it for the prefix degrade `disable-reasoning`. */
  | Readonly<{ field: 'reasoning.enabled'; value: false }>
  | Readonly<{ field: 'store'; value: false }>

export type GatewayField = GatewayParam['field']

/**
 * How the request of one record is written and its stream is read. Every field is required and
 * has no engine default. A new variation point is a new required field, so every record fails
 * to compile until it states a value.
 */
export type WireProfile = Readonly<{
  /** The role of the system instruction and of a system reminder. A compaction summary is `user`. */
  roles: Readonly<{
    instruction: 'system' | 'developer'
    reminder: 'system' | 'developer' | 'user'
  }>
  /**
   * `compact`: a content with exactly one text part is a string, any other content is an array of
   * parts. `parts`: assistant text, tool results and user content are always arrays of parts.
   */
  content: 'compact' | 'parts'
  /** `last-message`: `cache_control` on the last non-empty text part of the last message. */
  cache: Readonly<{ kind: 'none' }> | Readonly<{ kind: 'last-message'; ttl: '5m' | '1h' }>
  /** `null`: the record takes no image. */
  image: Readonly<{
    mediaTypes: readonly string[]
    detail: 'low' | 'high' | 'auto'
  }> | null
  /** Written on every request of the record, e.g. `{ field: 'store', value: false }`. */
  fixed: readonly GatewayParam[]
  /** How many usage-only chunks the decoder accepts after the finish chunk. */
  usageTail: Readonly<{ maxFrames: number }>
}>

/** Gateway provider pinning: body `provider.order`, and the `provider` names chunks may report. */
export type ServingPin = Readonly<{
  order: readonly [string, ...string[]]
  reports: readonly [string, ...string[]]
}>

/** A contract parameter kind other than `extension`. */
export type ParameterKind = Exclude<Parameter['kind'], 'extension'>
/** The value type of one parameter kind. */
export type ParameterValue<K extends ParameterKind> = Extract<Parameter, { kind: K }>['value']

/** What a record accepts for one parameter kind besides the contract vocabulary. */
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

/** The gateway fields whose value type is exactly `V`. */
export type FieldsOfValue<V> = GatewayParam extends infer P
  ? P extends GatewayParam
    ? [V] extends [P['value']]
      ? [P['value']] extends [V]
        ? P['field']
        : never
      : never
    : never
  : never

/** Where a record writes one parameter kind. `reasoning-effort` maps each value. */
export type ParameterWire<K extends ParameterKind> = K extends 'reasoning-effort'
  ? Readonly<Record<ParameterValue<'reasoning-effort'>, GatewayParam | 'unsupported'>>
  : Readonly<{ field: FieldsOfValue<ParameterValue<K>> }>

/** A unified parameter on one record: unsupported, or supported with range, default and field. */
export type ParameterRule<K extends ParameterKind> =
  | Readonly<{ support: 'unsupported' }>
  | Readonly<{
      support: 'supported'
      /** `send`: an omitted kind is recorded with origin `default` and written. `absent`: not written. */
      default: Readonly<{ kind: 'send'; value: ParameterValue<K> }> | Readonly<{ kind: 'absent' }>
      accept: ParameterAccept<K>
      wire: ParameterWire<K>
    }>

/** Mapped over the contract union: a new parameter kind fails every record at compile time. */
export type ParameterTable = Readonly<{ [K in ParameterKind]: ParameterRule<K> }>

/** An extension parameter matches by its whole definition adoption. */
export type ExtensionRule = Readonly<{ definition: Adoption; field: GatewayField }>

/** The prefix rule of a record: what the engine does when the history cannot satisfy it. */
export type PrefixRule =
  | Readonly<{ kind: 'none' }>
  /** The last assistant message that used a tool must be continuable, else reasoning is off. */
  | Readonly<{ kind: 'last-tool-turn'; degrade: 'disable-reasoning' }>

/** A record of the gateway engine. Pure JSON data. */
export type ChatCompletionsRecord = PiModelRecordHead &
  Readonly<{
    serving: ServingPin
    wire: WireProfile
    parameters: ParameterTable
    extensions: readonly ExtensionRule[]
    /**
     * The official replay declaration, the replay formats and the prefix rule. Plan refuses a
     * profile whose declaration for this supplier differs from `declaration`.
     */
    replay: Readonly<{
      declaration: ProfileReplay
      formats: Readonly<{ produces: string; accepts: readonly string[] }>
      prefix: PrefixRule
    }>
  }>

/**
 * The buffer limits of the stream decoder. They come from the family configuration, not from the
 * record: they bound memory, they are not a wire difference, and they stay out of the adoption.
 */
export type ChatCompletionsLimits = Readonly<{
  /**
   * The argument text of one tool call, buffered before its name or streamed after it: at most
   * `maxBytes` UTF-8 bytes, and the decode at finish keeps within every budget.
   */
  toolArguments: JsonLimits
  /** The UTF-16 length of the string members of all buffered reasoning detail fragments. */
  maxReasoningText: number
}>

// --- The four hooks: the only family code the engine calls ---------------------------------

/** One `reasoning_details` item after the decoder joined its fragments. Unknown members in `raw`. */
export type ReasoningDetail = Readonly<{
  type: 'reasoning.text' | 'reasoning.summary' | 'reasoning.encrypted' | 'other'
  format: string | null
  raw: Readonly<Record<string, JsonValue>>
}>

/** What a continuable assistant message writes for its reasoning. */
export type ReplayWire =
  | Readonly<{ kind: 'details'; details: readonly Readonly<Record<string, JsonValue>>[] }>
  | Readonly<{ kind: 'plain'; text: string }>
  | Readonly<{ kind: 'none' }>

/** A reasoning state part as the replay hook reads it. */
export type ReplayPart = Readonly<{ payload: string; format: string }>

/**
 * The reasoning codec of a family. The formats it produces and accepts are record data
 * (`record.replay.formats`), so they are inside the adoption digest.
 */
export type ReasoningCodec = Readonly<{
  /** All joined details at finish, to the payloads of state parts. Uninterpretable details give `[]`. */
  seal(
    details: readonly ReasoningDetail[],
  ): Outcome<readonly Readonly<{ payload: string }>[], ModelFault>
  /**
   * The wire members of one assistant message. `parts` are the carried state parts of a
   * continuable message (empty otherwise); `thinking` holds the thinking texts that go native,
   * or as unsigned reasoning for the foreign-thinking rule `adapter`.
   */
  replay(
    parts: readonly ReplayPart[],
    thinking: readonly string[],
  ): Outcome<ReplayWire, TransportFailure>
}>

/** The gateway usage object, parsed by the decoder. Unknown members in `raw`. */
export type GatewayUsage = Readonly<{
  promptTokens: string | null
  completionTokens: string | null
  cachedTokens: string | null
  reasoningTokens: string | null
  raw: Readonly<Record<string, JsonValue>>
}>

export type VendorHooks = Readonly<{
  /** `null`: the record has no reasoning to seal or replay. */
  reasoning: ReasoningCodec | null
  /** Family arithmetic and scope. An unknown scope gives items with state `unknown`, never a default. */
  usage(usage: GatewayUsage): Outcome<readonly ChatUsageItem[], ModelFault>
  /** The family JSON Schema subset. The `{type:'function', function:{…}}` wrapper is the engine's. */
  toolSchema(schema: JsonValue): Outcome<JsonValue, TransportFailure>
  /** Cross-field rules a table cannot state. Validates only, never rewrites. */
  check(
    input: Readonly<{
      applied: readonly Parameter[]
      messages: readonly ChatMessage[]
      treatments: readonly ReplayTreatment[]
    }>,
  ): Outcome<void, TransportFailure>
}>

// --- The meter seam: one projection for encode and meter -----------------------------------

/** One wire message of the projection, in wire order. */
export type ProjectedTurn = Readonly<{
  /** The log message this wire message comes from. Tool-result images keep their tool message. */
  message: ChatMessageId
  role: 'system' | 'developer' | 'user' | 'assistant' | 'tool'
  /** The parts that the wire message carries, without reasoning state parts. */
  blocks: readonly ProjectedPart[]
  replay: ReplayWire
}>

/** The request as the wire carries it. The meter sees exactly what encode writes. */
export type ProjectedRequest = Readonly<{
  instruction: readonly ContentBlock[]
  turns: readonly ProjectedTurn[]
  tools: readonly ToolDeclaration[]
  toolChoice: FixedModelRequest['toolChoice']
  applied: readonly Parameter[]
}>

export type FamilyMeter = Readonly<{
  /** `binding.counting` is `instance.basis`: one source. */
  instance: ModelInputMeter
  /** The family-fixed `tokenInput` and its representation adoption. */
  represent(view: ProjectedRequest): Readonly<{ adoption: Adoption; tokenInput: JsonValue }>
}>
