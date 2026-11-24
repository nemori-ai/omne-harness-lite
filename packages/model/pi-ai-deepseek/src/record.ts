import type { LimitMetric, ModelModality, TokenizerDefinition } from '@omne-harness/model-contract'
import type { RecordProvenance } from '@omne-harness/pi-ai-transport'
import type { ChatCompletionsRecord } from '@omne-harness/pi-ai-transport/chat-completions'
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
  reasoning: 'deepseek-reasoning-text/1'
  usage: 'deepseek-usage/1'
  toolSchema: 'object-root/1' | 'explicit-open-object-properties/1'
  check: 'none/1'
}>

export type ImageTokenRule = Readonly<{
  tilePixels: string
  tokensPerTile: string
  overheadTokens: string
}>

export type MeterData = Readonly<{
  representation: 'deepseek-visible-json/1'
  text: 'o200k-proxy/1'
  image?: ImageTokenRule
  coldRequestTokens?: string
  tokenizer: TokenizerDefinition
}>

export type DeepSeekRecord = ChatCompletionsRecord &
  Readonly<{
    profile: ProfileData
    rules: RuleNames
    meter: MeterData
    provenance: RecordProvenance
  }>
