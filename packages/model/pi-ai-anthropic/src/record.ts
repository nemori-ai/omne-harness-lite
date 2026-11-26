import type { TokenizerDefinition } from '@omne-harness/model-contract'
import type { RecordProvenance } from '@omne-harness/pi-ai-transport'
import type { ProfileData } from '@omne-harness/pi-ai-transport/family-kit'
import type { MessagesRecord } from '@omne-harness/pi-ai-transport/messages'
import type { ImageRuleName } from './images.ts'

export type MeterData = Readonly<{
  representation: 'anthropic-visible-json/1'
  text: 'claude-legacy-bpe-estimate/1'
  image: ImageRuleName
  tokenizer: TokenizerDefinition
}>

export type AnthropicRecord = MessagesRecord &
  Readonly<{
    profile: ProfileData
    meter: MeterData
    provenance: RecordProvenance
  }>
