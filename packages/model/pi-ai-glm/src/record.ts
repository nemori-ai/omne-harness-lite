import type { TokenizerDefinition } from '@omne-harness/model-contract'
import type { RecordProvenance } from '@omne-harness/pi-ai-transport'
import type { ChatCompletionsRecord } from '@omne-harness/pi-ai-transport/chat-completions'
import type { ImageTokenRule, ProfileData } from '@omne-harness/pi-ai-transport/family-kit'

export type RuleNames = Readonly<{
  reasoning: 'glm-reasoning-text/1'
  usage: 'glm-usage/1'
  toolSchema: 'object-root/1'
  check: 'none/1' | 'no-explicit-tool-none/1'
}>

export type MeterData = Readonly<{
  representation: 'glm-visible-json/1'
  text: 'o200k-proxy/1'
  image?: ImageTokenRule
  coldRequestTokens: string
  tokenizer: TokenizerDefinition
}>

export type GlmRecord = ChatCompletionsRecord &
  Readonly<{
    profile: ProfileData
    rules: RuleNames
    meter: MeterData
    provenance: RecordProvenance
  }>
