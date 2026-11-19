import type { ProfileReplay } from '@omne-harness/model-contract'
import type { PiModelRecordHead } from '../family-table.ts'
import type {
  ChatCompletionsLimits,
  ExtensionRule,
  ParameterTable,
  ServingPin,
} from '../chat-completions/vocabulary.ts'

/** How a request of the record is written on the Messages interface. */
export type MessagesWire = Readonly<{
  cache: Readonly<{ kind: 'none' }> | Readonly<{ kind: 'last-message'; ttl: '5m' | '1h' }>
  image: Readonly<{ mediaTypes: readonly string[] }> | null
  thinking: Readonly<{ display: 'summarized' | null }>
  toolNames: Readonly<{ rule: 'underscore/1'; maxLength: number }>
}>

/** What the model refuses that the parameter table does not already say. */
export type MessagesAccepts = Readonly<{
  forcedToolChoice: boolean
  endsWithAssistant: boolean
}>

export type MessagesRecord = PiModelRecordHead &
  Readonly<{
    engine: 'messages'
    serving: ServingPin
    wire: MessagesWire
    parameters: ParameterTable
    extensions: readonly ExtensionRule[]
    accepts: MessagesAccepts
    replay: Readonly<{
      declaration: ProfileReplay
      formats: Readonly<{ produces: string; accepts: readonly string[] }>
      binding: 'prefix' | 'none'
    }>
  }>

export type MessagesLimits = ChatCompletionsLimits

/** One block of the reasoning state of a reply, as the interface wrote it. */
export type ThinkingBlock =
  | Readonly<{ type: 'thinking'; thinking: string; signature: string }>
  | Readonly<{ type: 'redacted_thinking'; data: string }>
