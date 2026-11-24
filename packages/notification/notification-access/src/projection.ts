import { tenantCodec, type TenantId as LegalTenantId } from '@omne-harness/legal-identity'
import { encodeInstant, parseInstant, type Instant } from '@omne-harness/utc-instant'
import type {
  CatalogChannel,
  CatalogSource,
  DestinationView,
  Marks,
  NotificationSummary,
  NotificationView,
  Subscription,
} from '@omne-harness/notification-contract'
import type {
  NotificationChannelBody,
  NotificationDestinationBody,
  NotificationSourceBody,
  NotificationSubscriptionBody,
  NotificationSummaryBody,
  NotificationViewBody,
} from '@omne-harness/notification-protocol'

const SECONDS = '0000-00-00T00:00:00'

/** The domain keeps instants as text; the protocol carries them as instants. */
export function instantOf(text: string): Instant {
  const parsed = parseInstant(text)
  if (!parsed.ok) throw new TypeError('notification-access: the domain kept an invalid instant')
  return parsed.value
}

/** Milliseconds, as the domain writes instants. A finer instant stays finer, and the domain refuses it. */
export function instantText(instant: Instant): string {
  const text = encodeInstant(instant)
  const fraction = text.slice(SECONDS.length + 1, -1)
  return `${text.slice(0, SECONDS.length)}.${fraction.replace(/0+$/u, '').padEnd(3, '0')}Z`
}

export function tenantTextOf(tenant: LegalTenantId): string {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new TypeError('notification-access: tenant is not a minted TenantId')
  return encoded.value
}

export function marksOf(marks: Marks): NotificationSummaryBody['marks'] {
  const { seenAt, resolved, supersededBy } = marks
  return {
    seenAt: seenAt === null ? null : instantOf(seenAt),
    resolved: resolved === null ? null : { how: resolved.how, at: instantOf(resolved.at) },
    supersededBy:
      supersededBy === null ? null : { source: supersededBy.source, event: supersededBy.eventId },
  }
}

export function summaryOf(summary: NotificationSummary): NotificationSummaryBody {
  const { identity, recipient, sequence, type, title, level, cause, acceptedAt, marks } = summary
  return {
    source: identity.source,
    event: identity.eventId,
    recipient,
    sequence,
    type,
    title,
    level,
    cause,
    acceptedAt: instantOf(acceptedAt),
    marks: marksOf(marks),
  }
}

export function viewOf(view: NotificationView): NotificationViewBody {
  const { subject, at, body, locator } = view
  return { ...summaryOf(view), subject, at: instantOf(at), body, locator }
}

/** Who made a subscription, as a schedule's author is shown: an agent by its session. */
function creatorOf(creator: Subscription['creator']): NotificationSubscriptionBody['creator'] {
  return creator.kind === 'agent'
    ? { kind: 'agent', session: creator.originatingSessionRef }
    : { kind: creator.kind }
}

export function subscriptionOf(subscription: Subscription): NotificationSubscriptionBody {
  const { term } = subscription
  return {
    ...subscription,
    term: term.kind === 'until' ? { kind: 'until', at: instantOf(term.at) } : term,
    creator: creatorOf(subscription.creator),
  }
}

export function destinationOf(destination: DestinationView): NotificationDestinationBody {
  const { blockedSince } = destination
  return { ...destination, blockedSince: blockedSince === null ? null : instantOf(blockedSince) }
}

export function sourceOf(source: CatalogSource): NotificationSourceBody {
  return {
    name: source.name,
    label: source.label,
    types: source.types.map(type => ({
      name: type.name,
      label: type.label,
      description: type.description,
      kind: type.kind,
      subject: { presence: type.subject.presence, hint: type.subject.hint },
      subscribable: [...type.subscribable],
      nameable: [...type.nameable],
      defaults: { person: type.defaults.person, agent: type.defaults.agent },
      external: type.external,
    })),
  }
}

export function channelOf(channel: CatalogChannel): NotificationChannelBody {
  const { name, label, leavesSystem, addressHint } = channel
  return { name, label, leavesSystem, addressHint }
}
