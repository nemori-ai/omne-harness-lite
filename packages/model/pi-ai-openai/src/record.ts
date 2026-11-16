import type { LimitMetric, ModelModality, TokenizerDefinition } from '@omne-harness/model-contract'
import type { ChatCompletionsRecord } from '@omne-harness/pi-ai-transport/chat-completions'
import type { ImageRuleName } from './images.ts'
import type {
  CheckRuleName,
  ReasoningRuleName,
  ToolSchemaRuleName,
  UsageRuleName,
} from './rules.ts'

export type UpstreamData =
  | Readonly<{ kind: 'finite'; amount: string }>
  | Readonly<{ kind: 'unknown' }>

export type TokenLimitData = Readonly<{ provided: string; upstream: UpstreamData }>

export type LimitData = Readonly<{ metric: LimitMetric; provided: string; upstream: UpstreamData }>

export type ProfileData = Readonly<{
  input: readonly [ModelModality, ...ModelModality[]]
  output: readonly [ModelModality, ...ModelModality[]]
  context: Readonly<{
    window: TokenLimitData
    input: TokenLimitData | null
    output: TokenLimitData
  }>
  limits: readonly LimitData[]
  evidence: string
}>

export type RuleNames = Readonly<{
  reasoning: ReasoningRuleName
  usage: UsageRuleName
  toolSchema: ToolSchemaRuleName
  check: CheckRuleName
}>

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
