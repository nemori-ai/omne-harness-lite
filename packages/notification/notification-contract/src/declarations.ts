import type {
  ChannelName,
  EventTypeName,
  Level,
  RecipientKind,
  RecipientRef,
  SourceName,
} from './values.ts'

/** How an event of this type names the thing it is about. */
export type SubjectRule = Readonly<{
  presence: 'none' | 'optional' | 'required'
  /** One sentence for people and models: what a subject of this type looks like. */
  hint: string
  /** A pure check of the notation. Absent: every non-empty string is accepted. */
  accepts?: (subject: string) => boolean
}>

export type EventTypeDeclaration = Readonly<{
  name: EventTypeName
  label: string
  /** Written for a model that decides whether to subscribe. */
  description: string
  /**
   * `event`: happens once and arrives through a send.
   * `standing`: a state the source owns and publishes. `binding` is the source's opaque
   * reference to that published state. It never arrives through a send.
   */
  kind: Readonly<{ kind: 'event' }> | Readonly<{ kind: 'standing'; binding: string }>
  subject: SubjectRule
  /** Which kinds of recipient may subscribe. */
  subscribable: readonly RecipientKind[]
  /** Which kinds of recipient a send may name. Empty: naming is not allowed. */
  nameable: readonly RecipientKind[]
  /** The level a recipient of each kind gets without a subscription. */
  defaults: Readonly<Record<RecipientKind, Level>>
  /** The content comes from outside this system. */
  external: boolean
}>

export type SourceDeclaration = Readonly<{
  name: SourceName
  label: string
  types: readonly EventTypeDeclaration[]
}>

/** What the catalogue tells a caller about one source right now. */
export type SourceLookup =
  | Readonly<{ kind: 'registered'; declaration: SourceDeclaration }>
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'unreadable' }>

export function findEventType(
  declaration: SourceDeclaration,
  name: EventTypeName,
): EventTypeDeclaration | null {
  return declaration.types.find(type => type.name === name) ?? null
}

export function subjectAccepted(rule: SubjectRule, subject: string | null): boolean {
  if (subject === null) return rule.presence !== 'required'
  if (rule.presence === 'none') return false
  return rule.accepts === undefined || rule.accepts(subject)
}

/** The part of a declaration that crosses into a storage transaction: data only. */
export type EventTypeFacts = Readonly<{
  defaults: Readonly<Record<RecipientKind, Level>>
}>

export type ChannelAddressRule = Readonly<{
  hint: string
  accepts: (address: string) => boolean
}>

export type { ChannelName, RecipientRef }
