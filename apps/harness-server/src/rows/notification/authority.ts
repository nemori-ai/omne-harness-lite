import type { AuthorityAction, NotificationAuthority } from '@omne-harness/notification'
import { sameRecipient, type Actor, type RecipientRef } from '@omne-harness/notification-contract'
import { AGENT_POSTS, IN_APP } from '@omne-harness/notification-local'
import { OWNER_POSTS } from './owner-source.ts'

const PERSON: RecipientRef = { kind: 'person' }
const selfOf = (actor: Actor): RecipientRef => (actor.kind === 'owner' ? PERSON : actor.recipient)

/** An actor handles only what is its own: the owner the person's inbox, an agent its session's. Each sends as its one source. */
export function mayDo(actor: Actor, action: AuthorityAction): boolean {
  const own = (recipient: RecipientRef) => sameRecipient(recipient, selfOf(actor))
  switch (action.kind) {
    case 'send-as':
      return action.source === (actor.kind === 'owner' ? OWNER_POSTS.name : AGENT_POSTS.name)
    case 'read-inbox':
    case 'dispose':
    case 'subscribe-for':
      return own(action.recipient)
    case 'manage-destinations':
      return actor.kind === 'owner' && own(action.recipient)
    case 'be-recipient':
      return action.recipient.kind === 'person' || own(action.recipient)
    case 'list-catalog':
    case 'know-source':
      return true
  }
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
