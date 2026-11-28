import type { TokenizerDefinition } from '@omne-harness/model-contract'
import type { RecordProvenance } from '@omne-harness/pi-ai-transport'
import type { ChatCompletionsRecord } from '@omne-harness/pi-ai-transport/chat-completions'
import type { ImageTokenRule, ProfileData } from '@omne-harness/pi-ai-transport/family-kit'

export type RuleNames = Readonly<{
  reasoning: 'deepseek-reasoning-text/1'
  usage: 'deepseek-usage/1'
  toolSchema: 'object-root/1' | 'explicit-open-object-properties/1'
  check: 'none/1'
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
