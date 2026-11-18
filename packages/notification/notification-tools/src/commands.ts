import { hitlDecisionWait } from '@omne-harness/human-intervention-tool'
import type {
  CatalogSource,
  Marks,
  NotificationSummary,
  Subscription,
  SubscriptionChange,
} from '@omne-harness/notification-contract'
import { succeed } from '@omne-harness/operation-result'
import { consentCard, encodeConsentState, requestTree } from './consent.ts'
import type { BoundNotifications, Reached } from './port.ts'
import type { ArgumentsOf, NotificationsCommandName } from './protocol.ts'
import { answered, reading, tooLarge, unknown, writing, type Segment } from './results.ts'

const resolutionOf = (marks: Marks) =>
  marks.supersededBy !== null ? 'superseded' : (marks.resolved?.how ?? 'unresolved')

const entryOf = (entry: NotificationSummary) => ({
  source: entry.source,
  event: entry.identity.eventId,
  sequence: entry.sequence,
  type: entry.type,
  title: entry.title,
  level: entry.level,
  why: entry.cause,
  acceptedAt: entry.acceptedAt,
  seen: entry.marks.seenAt !== null,
  state: resolutionOf(entry.marks),
})

/** A subscription without its recipient: the agent only ever sees its own. */
function subscriptionOf(subscription: Subscription) {
  const { recipient: _, ...rest } = subscription
  return rest
}

const sourceOf = (source: CatalogSource) => ({
  source: source.name,
  label: source.label,
  types: source.types.map(type => ({
    type: type.name,
    label: type.label,
    description: type.description,
    kind: type.kind,
    subject: type.subject,
    agentsMaySubscribe: type.subscribable.includes('agent'),
    agentDefault: type.defaults.agent,
  })),
})

export type Handler<K extends NotificationsCommandName> = (
  reached: Reached,
  params: ArgumentsOf<K>['params'],
  bound: BoundNotifications,
) => Promise<Segment>
type Disposal = 'done' | 'dismiss' | 'restore'

/** The identity of a post: the source the application gave and an event id that is this agent's own. */
const postIdentity = ({ context, self }: Reached, bound: BoundNotifications, id: string) => ({
  tenant: context.tenant,
  source: bound.posts.source,
  eventId: bound.scoped(self, id),
})

/** Source, emitter and causal depth come from the call. The parameters have no field for them. */
const send: Handler<'send'> = (reached, params, bound) => {
  const { faces, context, self } = reached
  const request = {
    identity: postIdentity(reached, bound, params.id),
    event: {
      type: bound.posts.type,
      subject: self.ref,
      at: bound.now(),
      content: { title: params.title, body: params.body ?? '', locator: params.locator ?? null },
      replaceKey: params.replace === undefined ? null : bound.scoped(self, params.replace),
      renotify: params.renotify ?? false,
      named: [{ kind: 'person' as const }],
      origin: { emitter: self, depth: bound.causalDepth() },
    },
  }
  return writing(
    'send',
    () => faces.sending.send(context, request),
    (accepted, recalled) => ({ id: params.id, recipients: accepted.recipients, recalled }),
  )
}

const sent: Handler<'sent'> = (reached, params, bound) =>
  reading(
    'sent',
    () => reached.faces.sending.querySend(reached.context, postIdentity(reached, bound, params.id)),
    status =>
      status.kind === 'not-submitted'
        ? { id: params.id, accepted: false }
        : {
            id: params.id,
            accepted: true,
            recipients: status.notifications.map(({ recipient, marks }) => ({
              recipient,
              seen: marks.seenAt !== null,
              state: resolutionOf(marks),
            })),
          },
  )

const inbox: Handler<'inbox'> = ({ faces, context, self }, params) => {
  const query = {
    recipient: self,
    filter: params.filter ?? 'unresolved',
    after: params.after ?? null,
    limit: params.limit ?? 20,
  }
  return reading(
    'inbox',
    () => faces.inbox.list(context, query),
    page => ({ notifications: page.entries.map(entryOf), after: page.next }),
  )
}

const refOf = ({ context, self }: Reached, params: ArgumentsOf<'read'>['params']) => ({
  recipient: self,
  identity: { tenant: context.tenant, source: params.source, eventId: params.event },
})

const read: Handler<'read'> = (reached, params) =>
  reading(
    'read',
    () => reached.faces.inbox.read(reached.context, refOf(reached, params)),
    view => ({
      ...entryOf(view),
      subject: view.subject,
      at: view.at,
      body: view.body,
      locator: view.locator,
    }),
  )

const dispose =
  <K extends Disposal>(operation: K): Handler<K> =>
  (reached, params) =>
    writing(
      operation,
      () => reached.faces.inbox.mark(reached.context, refOf(reached, params), operation),
      (marks, recalled) => ({ state: resolutionOf(marks), recalled }),
    )

const sources: Handler<'sources'> = ({ faces, context }) =>
  reading(
    'sources',
    () => faces.catalog.sources(context),
    found => ({ sources: found.map(sourceOf) }),
  )

const subscriptions: Handler<'subscriptions'> = ({ faces, context, self }) =>
  reading(
    'subscriptions',
    () => faces.subscriptions.list(context, self),
    found => ({ subscriptions: found.map(subscriptionOf) }),
  )

export const changeOf = (reached: Reached, params: ArgumentsOf<'subscribe'>['params']) => ({
  recipient: reached.self,
  source: params.source,
  type: params.type,
  scope: params.scope ?? { kind: 'all' as const },
  level: params.level,
  note: params.note ?? null,
  term: params.term ?? { kind: 'standing' as const },
})

export const subscribed = (subscription: Subscription, recalled: boolean) => ({
  ...subscriptionOf(subscription),
  recalled,
})

/** The label the owner reads on the card, best effort: without the catalogue it is the name of the type. */
async function labelOf({ faces, context }: Reached, change: SubscriptionChange): Promise<string> {
  const found = await faces.catalog.sources(context).catch(() => undefined)
  for (const source of found?.kind === 'done' ? found.value : []) {
    const type =
      source.name === change.source
        ? source.types.find(item => item.name === change.type)
        : undefined
    if (type !== undefined) return `${source.label}：${type.label}`
  }
  return change.type
}

async function suspendForConsent(
  reached: Reached,
  params: ArgumentsOf<'subscribe'>['params'],
  request: Readonly<{ content: string; change: SubscriptionChange }>,
): Promise<Segment> {
  const { change, content } = request
  const label = await labelOf(reached, change)
  const card = consentCard({ self: reached.self, change, content, label })
  const state = encodeConsentState({ params, content, cardId: card.cardId })
  if ('failure' in state)
    return tooLarge(
      `${state.failure}: the note and the scope are too long to keep while the owner decides; shorten them`,
    )
  return succeed({
    kind: 'suspended',
    state: state.ok,
    closedResult:
      'owner-skipped: the card was closed before the owner answered; nothing was changed',
    wait: { kind: 'ask', key: 'consent', contract: hitlDecisionWait, request: requestTree(card) },
  })
}

const subscribe: Handler<'subscribe'> = async (reached, params) => {
  const { faces, context } = reached
  let outcome: Awaited<ReturnType<typeof faces.subscriptions.set>>
  try {
    outcome = await faces.subscriptions.set(context, changeOf(reached, params))
  } catch {
    return unknown('subscribe')
  }
  return outcome.kind === 'needs-confirmation'
    ? suspendForConsent(reached, params, outcome.request)
    : answered('subscribe', outcome, subscribed)
}

const unsubscribe: Handler<'unsubscribe'> = ({ faces, context, self }, params) => {
  const key = {
    recipient: self,
    source: params.source,
    type: params.type,
    scope: params.scope ?? { kind: 'all' as const },
  }
  return writing(
    'unsubscribe',
    () => faces.subscriptions.remove(context, key),
    (_none, recalled) => ({ recalled }),
  )
}

export type Reaching = Exclude<NotificationsCommandName, 'help'>
export const HANDLERS: { readonly [K in Reaching]: Handler<K> } = {
  send,
  sent,
  inbox,
  read,
  done: dispose('done'),
  dismiss: dispose('dismiss'),
  restore: dispose('restore'),
  sources,
  subscriptions,
  subscribe,
  unsubscribe,
}
