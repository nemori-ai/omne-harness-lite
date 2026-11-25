import type { RecordProvenance } from '@omne-harness/pi-ai-transport'
import type { ChatCompletionsRecord } from '@omne-harness/pi-ai-transport/chat-completions'
import type { ProfileData } from '@omne-harness/pi-ai-transport/family-kit'
import type { TokenizerDefinition } from '@omne-harness/model-contract'

export type RuleNames = Readonly<{
  reasoning: 'kimi-reasoning-text/1'
  usage: 'kimi-usage/1'
  toolSchema: 'object-root/1'
  check: 'none/1'
}>

export type MeterData = Readonly<{
  representation: 'kimi-visible-json/1'
  text: 'o200k-proxy/1'
  coldRequestTokens?: string
  tokenizer: TokenizerDefinition
}>

export type KimiRecord = ChatCompletionsRecord &
  Readonly<{
    profile: ProfileData
    rules: RuleNames
    meter: MeterData
    provenance: RecordProvenance
  }>
