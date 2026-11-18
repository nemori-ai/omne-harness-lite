import type { NotificationRecord } from './model.ts'
import type {
  ChannelName,
  EventTypeName,
  Instant,
  Locator,
  RecipientRef,
  SendIdentity,
  SourceName,
} from './values.ts'

export type DestinationRef = Readonly<{ recipient: RecipientRef; id: string }>

/** `strong`: the destination takes strong units only. `weak`: it takes the beat as well. */
export type MinLevel = 'strong' | 'weak'

export type Destination = DestinationRef &
  Readonly<{
    channel: ChannelName
    address: string
    minLevel: MinLevel
    enabled: boolean
    builtin: boolean
    lastStrongAt: Instant | null
    /** Every strong notification up to this inbox position was planned for this destination. */
    strongCursor: number
    strongUnits: number
    blocked: boolean
  }>

export type BoxEntry = NotificationRecord &
  Readonly<{
    source: SourceName
    type: EventTypeName
    title: string
    body: string
    locator: Locator | null
    external: boolean
  }>

export type StandingItem = Readonly<{
  id: string
  source: SourceName
  type: EventTypeName
  subject: string | null
  title: string
  locator: Locator | null
  since: Instant
}>

/** Anything but `ok` means the items are not known. It never means there are none. */
export type StandingRead =
  | Readonly<{ kind: 'ok'; items: readonly StandingItem[] }>
  | Readonly<{ kind: 'refused' | 'missing' | 'unknown' }>

export type UnitKind = 'strong' | 'beat' | 'standing'

export type UnitEntry = Readonly<{
  identity: SendIdentity
  source: SourceName
  type: EventTypeName
  title: string
}>

export type UnitBody =
  | Readonly<{
      kind: 'single'
      entry: UnitEntry & Pick<BoxEntry, 'body' | 'locator' | 'cause' | 'external'>
    }>
  | Readonly<{
      kind: 'digest'
      count: number
      listed: readonly UnitEntry[]
      /** Open standing items, or null when they could not be read. */
      standingOpen: number | null
    }>
  | Readonly<{ kind: 'standing'; item: StandingItem }>

/** Members and body are fixed when the unit is formed. Every delivery of it uses `id`. */
export type DeliveryUnit = Readonly<{
  id: string
  destination: DestinationRef
  kind: UnitKind
  members: readonly SendIdentity[]
  body: UnitBody
  formedAt: Instant
}>

export type DeliveryResult =
  | Readonly<{ kind: 'delivered' }>
  | Readonly<{ kind: 'failed'; reason: string; retryable: boolean }>
  | Readonly<{ kind: 'unknown' }>

export type Disclosure =
  | Readonly<{ kind: 'full' }>
  | Readonly<{ kind: 'excerpt'; length: number }>
  | Readonly<{ kind: 'title-only' }>

export type RetryPolicy = Readonly<{ maxAttempts: number; backoffMs: readonly number[] }>

export type RetryPlan =
  | Readonly<{ kind: 'settled' }>
  | Readonly<{ kind: 'retry'; at: Instant }>
  | Readonly<{ kind: 'stop' }>
