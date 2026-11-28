import type { AuthorityAction, NotificationAuthority } from '@omne-harness/notification'
import { sameRecipient, type Actor, type RecipientRef } from '@omne-harness/notification-contract'
import { AGENT_POSTS, IN_APP } from '@omne-harness/notification-local'
import { OWNER_POSTS } from './owner-source.ts'

const PERSON: RecipientRef = { kind: 'person' }
const selfOf = (actor: Actor): RecipientRef | undefined =>
  actor.kind === 'owner' ? PERSON : actor.kind === 'agent' ? actor.recipient : undefined
const sourceOf = (actor: Actor) =>
  actor.kind === 'owner'
    ? OWNER_POSTS.name
    : actor.kind === 'agent'
      ? AGENT_POSTS.name
      : actor.source

type Towards = Readonly<{ recipient: RecipientRef }>
const own = (actor: Actor, { recipient }: Towards) => {
  const self = selfOf(actor)
  return self !== undefined && sameRecipient(recipient, self)
}

type Rules = {
  [K in AuthorityAction['kind']]: (
    actor: Actor,
    action: Extract<AuthorityAction, { kind: K }>,
  ) => boolean
}

/** An actor handles only what is its own: the owner the person's inbox, an agent its session's, a source of the system nothing. Each sends as its one source. */
const RULES: Rules = {
  'send-as': (actor, { source }) => source === sourceOf(actor),
  'read-inbox': own,
  dispose: own,
  'subscribe-for': own,
  'manage-destinations': (actor, action) => actor.kind === 'owner' && own(actor, action),
  'be-recipient': (actor, action) => action.recipient.kind === 'person' || own(actor, action),
  'list-catalog': () => true,
  'know-source': () => true,
}

export function mayDo(actor: Actor, action: AuthorityAction): boolean {
  const rule = RULES[action.kind] as (actor: Actor, action: AuthorityAction) => boolean
  return rule(actor, action)
}

/** The actor of a context comes from a trusted adapter: the access row for a login, the tool binding for a call. */
export function createNotificationAuthority(): NotificationAuthority {
  return {
    async decide(ctx, action) {
      return mayDo(ctx.actor, action) ? 'allowed' : 'denied'
    },
    async disclosure(_tenant, destination) {
      return destination.channel === IN_APP ? { kind: 'full' } : { kind: 'title-only' }
    },
  }
}
