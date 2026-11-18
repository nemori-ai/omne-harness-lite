import type {
  ChannelName,
  EventTypeName,
  Level,
  RecipientKind,
  RecipientRef,
  SourceName,
} from './values.ts'

export type SubjectRule = Readonly<{
  presence: 'none' | 'optional' | 'required'
  hint: string
  /** A pure check of the notation. Absent: every non-empty string is accepted. */
  accepts?: (subject: string) => boolean
}>

export type EventTypeDeclaration = Readonly<{
  name: EventTypeName
  label: string
  /** Written for a model that decides whether to subscribe. */
  description: string
  /** `standing`: a state the source owns and publishes; `binding` is its opaque reference. It never arrives by a send. */
  kind: Readonly<{ kind: 'event' }> | Readonly<{ kind: 'standing'; binding: string }>
  subject: SubjectRule
  subscribable: readonly RecipientKind[]
  /** Which kinds of recipient a send may name. Empty: naming is not allowed. */
  nameable: readonly RecipientKind[]
  defaults: Readonly<Record<RecipientKind, Level>>
  external: boolean
}>

export type SourceDeclaration = Readonly<{
  name: SourceName
  label: string
  types: readonly EventTypeDeclaration[]
}>

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
