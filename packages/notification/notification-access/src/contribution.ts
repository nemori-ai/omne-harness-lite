import type { AccessContribution } from '@omne-harness/access-cordis-contract'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type {
  BeatRefusal,
  CallContext,
  InboxReadRefusal,
  InboxRefusal,
  Outcome,
  RecipientRefusal,
  SubscriptionRefusal,
  SubscriptionRemovalRefusal,
} from '@omne-harness/notification-contract'
import type { NotificationProtocol } from '@omne-harness/notification-protocol'
import { createChangeObservation } from './observe-changes.ts'
import type { NotificationChangeFeed, NotificationFaces, NotificationPrincipals } from './ports.ts'
import {
  channelOf,
  destinationOf,
  instantText,
  marksOf,
  sourceOf,
  subscriptionOf,
  summaryOf,
  viewOf,
} from './projection.ts'

export type NotificationContributionInput = Readonly<{
  principals: NotificationPrincipals
  faces: () => NotificationFaces | undefined
  changes: () => NotificationChangeFeed | undefined
}>

type Handlers = AccessContribution<NotificationProtocol>['operations']
type Login = Parameters<NotificationPrincipals['actingFor']>[0]

const UNAVAILABLE = Object.freeze({ outcome: 'basis-unavailable' as const })
const DENIED = Object.freeze({ outcome: 'denied' as const })
const UNKNOWN = Object.freeze({ outcome: 'unknown' as const })
const NOT_FOUND = { outcome: 'not-found', body: {} } as const
const NOT_WRITABLE = { outcome: 'not-writable', body: {} } as const
const invalid = <R extends string>(reason: R) => ({ outcome: 'invalid', body: { reason } }) as const
const REQUEST = invalid('request')
const succeeded = <B>(body: B) => ({ outcome: 'succeeded', body }) as const
/** A commit that found its result already there answers `no-change`: that is how it is recalled. */
const committed = <B>(recalled: boolean, body: B) =>
  recalled ? ({ outcome: 'no-change', body } as const) : succeeded(body)

const recipientRefusal = (reason: RecipientRefusal) =>
  reason === 'not-permitted' ? DENIED : REQUEST
const readRefusal = (reason: InboxReadRefusal) => (reason === 'not-found' ? NOT_FOUND : REQUEST)

function markRefusal(reason: InboxRefusal) {
  if (reason === 'restore-first' || reason === 'superseded')
    return { outcome: 'conflict', body: { reason } } as const
  return readRefusal(reason)
}

function subscriptionRefusal(reason: SubscriptionRefusal) {
  switch (reason) {
    case 'term-in-past':
    case 'not-subscribable':
    case 'scope-does-not-fit':
      return invalid(reason)
    case 'invalid-request':
    case 'invalid-scope':
    case 'invalid-term':
      return REQUEST
    case 'not-permitted':
    case 'not-own-recipient':
    case 'confirmation-mismatch':
      return DENIED
  }
}

const removalRefusal = (reason: SubscriptionRemovalRefusal) =>
  reason === 'invalid-scope' || reason === 'invalid-request' ? REQUEST : DENIED

const beatRefusal = (reason: BeatRefusal) =>
  reason === 'out-of-range' ? invalid(reason) : recipientRefusal(reason)

/** Step four for reads: a throw, like a read the domain could not make, is an unavailable basis. */
async function reading<T, R, D, F>(
  call: () => Promise<Outcome<T, R>>,
  done: (value: T) => D,
  refused: (reason: R) => F,
) {
  let outcome: Outcome<T, R>
  try {
    outcome = await call()
  } catch {
    return UNAVAILABLE
  }
  if (outcome.kind === 'done') return done(outcome.value)
  return outcome.kind === 'refused' ? refused(outcome.reason) : UNAVAILABLE
}

/** Step four for commits: after a throw nobody knows whether the facts were written. */
async function committing<T, R, D, F>(
  call: () => Promise<Outcome<T, R>>,
  done: (value: T, recalled: boolean) => D,
  refused: (reason: R) => F,
) {
  let outcome: Outcome<T, R>
  try {
    outcome = await call()
  } catch {
    return UNKNOWN
  }
  switch (outcome.kind) {
    case 'done':
      return done(outcome.value, outcome.recalled)
    case 'refused':
      return refused(outcome.reason)
    case 'basis-unavailable':
      return UNAVAILABLE
    case 'unknown':
      return UNKNOWN
  }
}

function tenantTextOf(tenant: TenantId): string {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new TypeError('notification-access: tenant is not a minted TenantId')
  return encoded.value
}

type Ready = Readonly<{ outcome: null; faces: NotificationFaces; ctx: CallContext }>

/** Steps one to three: the login acts for the tenant, the principal is current, the faces are here. */
export async function prepare(
  input: Pick<NotificationContributionInput, 'principals' | 'faces'>,
  login: Login,
  tenant: TenantId,
): Promise<Ready | typeof DENIED | typeof UNAVAILABLE> {
  const tenantText = tenantTextOf(tenant)
  let issued: Awaited<ReturnType<NotificationPrincipals['actingFor']>>
  try {
    issued = await input.principals.actingFor(login, tenantText)
  } catch {
    return UNAVAILABLE
  }
  if ('refused' in issued) return issued.refused === 'denied' ? DENIED : UNAVAILABLE
  const faces = input.faces()
  if (faces === undefined) return UNAVAILABLE
  return { outcome: null, faces, ctx: input.principals.contextOf(issued.ok, tenantText) }
}

type SendRef = Readonly<{ source: string; event: string }>
const identityOf = ({ tenant }: CallContext, { source, event }: SendRef) => ({
  tenant,
  source,
  eventId: event,
})

function inboxHandlers(input: NotificationContributionInput) {
  const listInbox: Handlers['list-inbox'] = async (call, body) => {
    const ready = await prepare(input, call.principal, body.tenant)
    if (ready.outcome !== null) return ready
    const { recipient, filter, after, limit } = body
    return reading(
      () => ready.faces.inbox.list(ready.ctx, { recipient, filter, after, limit }),
      page => succeeded({ entries: page.entries.map(summaryOf), next: page.next }),
      readRefusal,
    )
  }

  const readNotification: Handlers['read-notification'] = async (call, body) => {
    const ready = await prepare(input, call.principal, body.tenant)
    if (ready.outcome !== null) return ready
    const ref = { recipient: body.recipient, identity: identityOf(ready.ctx, body) }
    return reading(
      () => ready.faces.inbox.read(ready.ctx, ref),
      view => succeeded(viewOf(view)),
      readRefusal,
    )
  }

  const mark: Handlers['mark'] = async (call, body) => {
    const ready = await prepare(input, call.principal, body.tenant)
    if (ready.outcome !== null) return ready
    const ref = { recipient: body.recipient, identity: identityOf(ready.ctx, body) }
    return committing(
      () => ready.faces.inbox.mark(ready.ctx, ref, body.operation),
      (marks, recalled) => committed(recalled, marksOf(marks)),
      markRefusal,
    )
  }

  const querySend: Handlers['query-send'] = async (call, body) => {
    const ready = await prepare(input, call.principal, body.tenant)
    if (ready.outcome !== null) return ready
    return reading(
      () => ready.faces.sending.querySend(ready.ctx, identityOf(ready.ctx, body)),
      status =>
        succeeded(
          status.kind === 'not-submitted'
            ? status
            : {
                kind: status.kind,
                notifications: status.notifications.map(({ recipient, marks }) => ({
                  recipient,
                  marks: marksOf(marks),
                })),
              },
        ),
      reason => (reason === 'not-permitted' ? DENIED : REQUEST),
    )
  }

  return {
    'list-inbox': listInbox,
    'read-notification': readNotification,
    mark,
    'query-send': querySend,
  }
}

function subscriptionHandlers(input: NotificationContributionInput) {
  const listSubscriptions: Handlers['list-subscriptions'] = async (call, body) => {
    const ready = await prepare(input, call.principal, body.tenant)
    if (ready.outcome !== null) return ready
    return reading(
      () => ready.faces.subscriptions.list(ready.ctx, body.recipient),
      found => succeeded({ subscriptions: found.map(subscriptionOf) }),
      recipientRefusal,
    )
  }

  /** The owner needs nobody's consent. A context that is asked for it cannot give it here: denied. */
  const setSubscription: Handlers['set-subscription'] = async (call, body) => {
    const ready = await prepare(input, call.principal, body.tenant)
    if (ready.outcome !== null) return ready
    const { tenant: _, term, ...rest } = body
    const change = {
      ...rest,
      term: term.kind === 'until' ? { kind: term.kind, at: instantText(term.at) } : term,
    }
    return committing(
      async () => {
        const outcome = await ready.faces.subscriptions.set(ready.ctx, change)
        return outcome.kind === 'needs-confirmation'
          ? ({ kind: 'refused', reason: 'not-permitted' } as const)
          : outcome
      },
      (subscription, recalled) => committed(recalled, subscriptionOf(subscription)),
      subscriptionRefusal,
    )
  }

  const removeSubscription: Handlers['remove-subscription'] = async (call, body) => {
    const ready = await prepare(input, call.principal, body.tenant)
    if (ready.outcome !== null) return ready
    const { tenant: _, ...key } = body
    return committing(
      () => ready.faces.subscriptions.remove(ready.ctx, key),
      (_none, recalled) => committed(recalled, {}),
      removalRefusal,
    )
  }

  const readBeat: Handlers['read-beat'] = async (call, body) => {
    const ready = await prepare(input, call.principal, body.tenant)
    if (ready.outcome !== null) return ready
    return reading(
      () => ready.faces.subscriptions.beat(ready.ctx, body.recipient),
      succeeded,
      recipientRefusal,
    )
  }

  const setBeat: Handlers['set-beat'] = async (call, body) => {
    const ready = await prepare(input, call.principal, body.tenant)
    if (ready.outcome !== null) return ready
    return committing(
      () => ready.faces.subscriptions.setBeat(ready.ctx, body.recipient, body.beat),
      (beat, recalled) => committed(recalled, beat),
      beatRefusal,
    )
  }

  return {
    'list-subscriptions': listSubscriptions,
    'set-subscription': setSubscription,
    'remove-subscription': removeSubscription,
    'read-beat': readBeat,
    'set-beat': setBeat,
  }
}

function destinationHandlers(input: NotificationContributionInput) {
  const listDestinations: Handlers['list-destinations'] = async (call, body) => {
    const ready = await prepare(input, call.principal, body.tenant)
    if (ready.outcome !== null) return ready
    return reading(
      () => ready.faces.destinations.list(ready.ctx, body.recipient),
      found => succeeded({ destinations: found.map(destinationOf) }),
      recipientRefusal,
    )
  }

  const addDestination: Handlers['add-destination'] = async (call, body) => {
    const ready = await prepare(input, call.principal, body.tenant)
    if (ready.outcome !== null) return ready
    const { tenant: _, ...destination } = body
    return committing(
      () => ready.faces.destinations.add(ready.ctx, destination),
      (added, recalled) => committed(recalled, destinationOf(added)),
      reason => (reason === 'invalid-address' ? invalid('address') : recipientRefusal(reason)),
    )
  }

  const changeDestination: Handlers['change-destination'] = async (call, body) => {
    const ready = await prepare(input, call.principal, body.tenant)
    if (ready.outcome !== null) return ready
    const { tenant: _, recipient, id, ...patch } = body
    return committing(
      () => ready.faces.destinations.change(ready.ctx, { recipient, id }, patch),
      (changed, recalled) => committed(recalled, destinationOf(changed)),
      reason => (reason === 'not-found' ? NOT_FOUND : recipientRefusal(reason)),
    )
  }

  const removeDestination: Handlers['remove-destination'] = async (call, body) => {
    const ready = await prepare(input, call.principal, body.tenant)
    if (ready.outcome !== null) return ready
    const { recipient, id } = body
    return committing(
      () => ready.faces.destinations.remove(ready.ctx, { recipient, id }),
      (_none, recalled) => committed(recalled, {}),
      reason => (reason === 'builtin' ? NOT_WRITABLE : recipientRefusal(reason)),
    )
  }

  return {
    'list-destinations': listDestinations,
    'add-destination': addDestination,
    'change-destination': changeDestination,
    'remove-destination': removeDestination,
  }
}

function catalogHandlers(input: NotificationContributionInput) {
  const listSources: Handlers['list-sources'] = async (call, body) => {
    const ready = await prepare(input, call.principal, body.tenant)
    if (ready.outcome !== null) return ready
    return reading(
      () => ready.faces.catalog.sources(ready.ctx),
      sources => succeeded({ sources: sources.map(sourceOf) }),
      () => DENIED,
    )
  }

  const listChannels: Handlers['list-channels'] = async (call, body) => {
    const ready = await prepare(input, call.principal, body.tenant)
    if (ready.outcome !== null) return ready
    return reading(
      () => ready.faces.catalog.channels(ready.ctx),
      channels => succeeded({ channels: channels.map(channelOf) }),
      () => DENIED,
    )
  }

  return { 'list-sources': listSources, 'list-channels': listChannels }
}

export function createNotificationContribution(
  input: NotificationContributionInput,
): Omit<AccessContribution<NotificationProtocol>, 'protocol'> {
  return {
    operations: {
      ...inboxHandlers(input),
      ...subscriptionHandlers(input),
      ...destinationHandlers(input),
      ...catalogHandlers(input),
    },
    observations: { 'observe-changes': createChangeObservation(input) },
  }
}
