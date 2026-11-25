import type { TokenizerDefinition } from '@omne-harness/model-contract'
import type { RecordProvenance } from '@omne-harness/pi-ai-transport'
import type { ChatCompletionsRecord } from '@omne-harness/pi-ai-transport/chat-completions'
import type { ProfileData } from '@omne-harness/pi-ai-transport/family-kit'
import type { ResponsesRecord } from '@omne-harness/pi-ai-transport/responses'
import type { ImageRuleName } from './images.ts'
import type {
  CheckRuleName,
  ReasoningRuleName,
  ToolSchemaRuleName,
  UsageRuleName,
} from './rules.ts'

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

export type OpenAiChatRecord = ChatCompletionsRecord &
  Readonly<{
    profile: ProfileData
    rules: RuleNames
    meter: MeterData
  }>

export type OpenAiResponsesRecord = ResponsesRecord &
  Readonly<{
    profile: ProfileData
    meter: MeterData
    provenance: RecordProvenance
  }>

export type OpenAiRecord = OpenAiChatRecord | OpenAiResponsesRecord
