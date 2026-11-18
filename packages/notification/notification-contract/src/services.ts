import type { z } from 'zod'
import type { SendRefusal } from './decide-send.ts'
import type {
  BoxedLevel,
  Cause,
  EventTypeName,
  Instant,
  Locator,
  Marks,
  Outcome,
  ParseRefusal,
  RecipientRef,
  SendIdentity,
  SourceName,
  TenantId,
  sendIdentitySchema,
  sendRequestSchema,
} from './values.ts'
import type { MarkOperation } from './decide-mark.ts'
import type { Destination, DestinationRef, MinLevel } from './delivery-model.ts'
import type {
  Confirmation,
  SubscriptionChange,
  SubscriptionRefusal,
  subscriptionChangeSchema,
  subscriptionKeySchema,
} from './decide-subscription.ts'
import type { Subscription } from './model.ts'

export type Actor =
  | Readonly<{ kind: 'owner' }>
  | Readonly<{ kind: 'agent'; recipient: Extract<RecipientRef, { kind: 'agent' }> }>

/** `subject` is the verified principal, handed to the authority port. A trusted adapter builds this, never a model. */
export type CallContext = Readonly<{ tenant: TenantId; subject: unknown; actor: Actor }>

export type SendRequestInput = z.input<typeof sendRequestSchema>
export type SendIdentityInput = z.input<typeof sendIdentitySchema>

export type Accepted = Readonly<{ identity: SendIdentity; recipients: readonly RecipientRef[] }>

export type SendStatus =
  | Readonly<{
      kind: 'accepted'
      notifications: readonly Readonly<{ recipient: RecipientRef; marks: Marks }>[]
    }>
  | Readonly<{ kind: 'not-submitted' }>

export interface NotificationSending {
  /** Hands one event over. `done` means every recipient's notification is in its inbox. */
  send(
    ctx: CallContext,
    request: SendRequestInput,
  ): Promise<Outcome<Accepted, ParseRefusal | SendRefusal>>
  querySend(
    ctx: CallContext,
    identity: SendIdentityInput,
  ): Promise<Outcome<SendStatus, ParseRefusal | 'not-permitted'>>
}

export type InboxFilter = 'unresolved' | 'all'

export type InboxQuery = Readonly<{
  recipient: RecipientRef
  filter: InboxFilter
  after: number | null
  limit: number
}>

export type NotificationSummary = Readonly<{
  identity: SendIdentity
  recipient: RecipientRef
  sequence: number
  source: SourceName
  type: EventTypeName
  title: string
  level: BoxedLevel
  cause: Cause
  acceptedAt: Instant
  marks: Marks
}>

export type InboxPage = Readonly<{ entries: readonly NotificationSummary[]; next: number | null }>

export type NotificationView = NotificationSummary &
  Readonly<{ subject: string | null; at: Instant; body: string; locator: Locator | null }>

export type NotificationRef = Readonly<{ recipient: RecipientRef; identity: SendIdentity }>

/** `not-found` covers no authority, no such notification, and a notification of another tenant. */
export type InboxRefusal = 'invalid-request' | 'not-found' | 'restore-first' | 'superseded'

export interface NotificationInbox {
  list(ctx: CallContext, query: InboxQuery): Promise<Outcome<InboxPage, InboxRefusal>>
  /** Reads one notification in full. Reading does not mark it seen. */
  read(ctx: CallContext, ref: NotificationRef): Promise<Outcome<NotificationView, InboxRefusal>>
  mark(
    ctx: CallContext,
    ref: NotificationRef,
    operation: MarkOperation,
  ): Promise<Outcome<Marks, InboxRefusal>>
}

export type SubscriptionChangeInput = z.input<typeof subscriptionChangeSchema>
export type SubscriptionKeyInput = z.input<typeof subscriptionKeySchema>

export type ConfirmationRequest = Readonly<{ content: string; change: SubscriptionChange }>

export type SubscriptionOutcome =
  | Outcome<Subscription, SubscriptionRefusal>
  | Readonly<{ kind: 'needs-confirmation'; request: ConfirmationRequest }>

export type Beat =
  | Readonly<{ kind: 'default' }>
  | Readonly<{ kind: 'off' }>
  | Readonly<{ kind: 'every'; minutes: number }>

export interface NotificationSubscriptions {
  /** Sets one subscription. It affects sends accepted afterwards, never what is in an inbox. */
  set(
    ctx: CallContext,
    change: SubscriptionChangeInput,
    confirmation?: Confirmation | null,
  ): Promise<SubscriptionOutcome>
  /** Returns the key to the default of its event type. Not the same as setting it to `off`. */
  remove(ctx: CallContext, key: SubscriptionKeyInput): Promise<Outcome<null, SubscriptionRefusal>>
  list(
    ctx: CallContext,
    recipient: RecipientRef,
  ): Promise<Outcome<readonly Subscription[], SubscriptionRefusal>>
  setBeat(
    ctx: CallContext,
    recipient: RecipientRef,
    beat: Beat,
  ): Promise<Outcome<Beat, SubscriptionRefusal>>
}

export type DestinationState = 'enabled' | 'disabled' | 'channel-absent'

export type DestinationView = Pick<
  Destination,
  'recipient' | 'id' | 'channel' | 'address' | 'minLevel' | 'builtin' | 'blocked'
> &
  Readonly<{ state: DestinationState }>

export type DestinationRefusal =
  | 'invalid-request'
  | 'not-permitted'
  | 'invalid-address'
  | 'not-found'
  | 'builtin'

export type NewDestination = Readonly<{
  recipient: RecipientRef
  channel: string
  address: string
  minLevel: MinLevel
}>

export type DestinationPatch = Readonly<{ minLevel?: MinLevel; enabled?: boolean }>

export interface NotificationDestinations {
  add(
    ctx: CallContext,
    destination: NewDestination,
  ): Promise<Outcome<DestinationView, DestinationRefusal>>
  change(
    ctx: CallContext,
    ref: DestinationRef,
    patch: DestinationPatch,
  ): Promise<Outcome<DestinationView, DestinationRefusal>>
  remove(ctx: CallContext, ref: DestinationRef): Promise<Outcome<null, DestinationRefusal>>
  list(
    ctx: CallContext,
    recipient: RecipientRef,
  ): Promise<Outcome<readonly DestinationView[], DestinationRefusal>>
}
