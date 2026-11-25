import type { TokenizerDefinition } from '@omne-harness/model-contract'
import type { RecordProvenance } from '@omne-harness/pi-ai-transport'
import type { ChatCompletionsRecord } from '@omne-harness/pi-ai-transport/chat-completions'
import type { ProfileData } from '@omne-harness/pi-ai-transport/family-kit'

export type RuleNames = Readonly<{
  reasoning: 'qwen-reasoning-text/1'
  usage: 'qwen-usage/1'
  toolSchema: 'object-root/1'
  check: 'none/1'
}>

export type MeterData = Readonly<{
  representation: 'qwen-visible-json/1'
  text: 'o200k-proxy/1'
  tokenizer: TokenizerDefinition
}>

export type QwenRecord = ChatCompletionsRecord &
  Readonly<{
    profile: ProfileData
    rules: RuleNames
    meter: MeterData
    provenance: RecordProvenance
  }>
