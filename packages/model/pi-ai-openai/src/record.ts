// The record type of the OpenAI family. A record is pure JSON data: the gateway engine reads the
// wire part, the profile part becomes the official profile, and the rule and meter names select
// code from the revisioned tables. The whole record is inside the adoption digest.
import type { LimitMetric, ModelModality, TokenizerDefinition } from '@omne-harness/model-contract'
import type { ChatCompletionsRecord } from '@omne-harness/pi-ai-transport/chat-completions'
import type { ImageRuleName } from './images.ts'
import type { CheckRuleName, ReasoningRuleName, ToolSchemaRuleName, UsageRuleName } from './rules.ts'

/** An upstream limit as the record states it. A finite value has the record evidence as source. */
export type UpstreamData =
  | Readonly<{ kind: 'finite'; amount: string }>
  | Readonly<{ kind: 'unknown' }>

export type TokenLimitData = Readonly<{ provided: string; upstream: UpstreamData }>

export type LimitData = Readonly<{ metric: LimitMetric; provided: string; upstream: UpstreamData }>

/** The profile part: what becomes the official profile, without wire data. */
export type ProfileData = Readonly<{
  input: readonly [ModelModality, ...ModelModality[]]
  output: readonly [ModelModality, ...ModelModality[]]
  context: Readonly<{
    window: TokenLimitData
    input: TokenLimitData | null
    output: TokenLimitData
  }>
  limits: readonly LimitData[]
  /** Where the finite upstream values come from. The evidence adoption pins this text. */
  evidence: string
}>

/** The rule names of the four hooks. */
export type RuleNames = Readonly<{
  reasoning: ReasoningRuleName
  usage: UsageRuleName
  toolSchema: ToolSchemaRuleName
  check: CheckRuleName
}>

/** The meter part: the token input schema, the text and image rules and the tokenizer. */
export type MeterData = Readonly<{
  representation: 'openai-visible-json/1'
  text: 'o200k-proxy/1'
  image: ImageRuleName
  tokenizer: TokenizerDefinition
}>

export type OpenAiRecord = ChatCompletionsRecord &
  Readonly<{
    profile: ProfileData
    rules: RuleNames
    meter: MeterData
  }>
