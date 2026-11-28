import type { ClientOf } from '@omne-harness/sdk/core'
import type { SessionProtocol } from '@omne-harness/session-protocol'

/** What the sender saw the words mean, as sent with them. */
export type SenderSeen = NonNullable<Parameters<ClientOf<SessionProtocol>['send-input']>[0]['seen']>

export type AssistTone = 'reference' | 'command' | 'refused' | 'note'
export type AssistMark = Readonly<{ from: number; to: number; tone: AssistTone; label: string }>
export type AssistItem = Readonly<{
  id: string
  label: string
  title: string
  kind: string
  unavailable: string | null
}>
export type AssistMenu = Readonly<{
  items: readonly AssistItem[]
  selected: number
  note: string
}>
export type Assist = Readonly<{
  marks: readonly AssistMark[]
  ghost: string
  menu: AssistMenu | null
  /** Why the words cannot be sent as they are, or null. */
  blocked: string | null
  seen: SenderSeen | null
}>
export type AssistKey = 'up' | 'down' | 'tab' | 'enter' | 'escape'
export type AssistAnswer =
  | Readonly<{ kind: 'pass' }>
  | Readonly<{ kind: 'held' }>
  | Readonly<{ kind: 'send' }>
  | Readonly<{ kind: 'edit'; text: string; caret: number }>

/** The helper of one composer: it reads the words and the caret, and answers for the keys it takes. */
export type ComposerHelper = Readonly<{
  subscribe(listener: () => void): () => void
  read(): Assist
  input(text: string, caret: number): void
  composing(on: boolean): void
  key(key: AssistKey): AssistAnswer
  take(index: number): AssistAnswer
  literal(text: string): string
  refused(reason: string): void
  close(): void
}>

/** What helps the composer of a session; the composer works as it is without one. */
export type ComposerAssistant = Readonly<{
  open(tenant: string, session: string): ComposerHelper
}>

export const NO_ASSIST: Assist = Object.freeze({
  marks: [],
  ghost: '',
  menu: null,
  blocked: null,
  seen: null,
})
