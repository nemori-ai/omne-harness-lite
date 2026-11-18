import {
  parseWith,
  recipientRefSchema,
  sendIdentitySchema,
  type CallContext,
  type InboxRefusal,
  type NotificationInbox,
  type NotificationRef,
  type RecipientRef,
} from '@omne-harness/notification-contract'
import { ask, type AuthorityAction, type Clock, type NotificationAuthority } from './ports.ts'
import type { NotificationStore } from './store.ts'

export type InboxDependencies = Readonly<{
  authority: NotificationAuthority
  store: NotificationStore
  clock: Clock
  pageLimit: number
}>

const UNAVAILABLE = { kind: 'basis-unavailable' } as const
const refuse = (reason: InboxRefusal) => ({ kind: 'refused', reason }) as const
type Blocked = typeof UNAVAILABLE | ReturnType<typeof refuse>

function parseRef(ref: NotificationRef): NotificationRef | null {
  const recipient = parseWith(recipientRefSchema, ref.recipient)
  const identity = parseWith(sendIdentitySchema, ref.identity)
  return 'ok' in recipient && 'ok' in identity
    ? { recipient: recipient.ok, identity: identity.ok }
    : null
}

export function createInbox(deps: InboxDependencies): NotificationInbox {
  /** No authority answers the same as a notification that does not exist. */
  async function gate(
    ctx: CallContext,
    kind: Extract<AuthorityAction['kind'], 'read-inbox' | 'dispose'>,
    recipient: RecipientRef,
  ): Promise<Blocked | null> {
    const answer = await ask(deps.authority, ctx, { kind, recipient })
    if (answer === 'denied') return refuse('not-found')
    return answer === 'unavailable' ? UNAVAILABLE : null
  }

  return {
    async list(ctx, query) {
      const recipient = parseWith(recipientRefSchema, query.recipient)
      const sized =
        Number.isInteger(query.limit) && query.limit >= 1 && query.limit <= deps.pageLimit
      const placed = query.after === null || (Number.isInteger(query.after) && query.after >= 0)
      const filtered = query.filter === 'unresolved' || query.filter === 'all'
      if (!('ok' in recipient) || !sized || !placed || !filtered) return refuse('invalid-request')
      const blocked = await gate(ctx, 'read-inbox', recipient.ok)
      if (blocked !== null) return blocked
      const page = await deps.store.box(ctx.tenant, { ...query, recipient: recipient.ok })
      if (page.kind === 'unavailable') return UNAVAILABLE
      return { kind: 'done', recalled: false, value: page.value }
    },

    async read(ctx, input) {
      const ref = parseRef(input)
      if (ref === null) return refuse('invalid-request')
      const blocked = await gate(ctx, 'read-inbox', ref.recipient)
      if (blocked !== null) return blocked
      if (ref.identity.tenant !== ctx.tenant) return refuse('not-found')
      const view = await deps.store.notification(ctx.tenant, ref)
      if (view.kind === 'unavailable') return UNAVAILABLE
      if (view.value === null) return refuse('not-found')
      return { kind: 'done', recalled: false, value: view.value }
    },

    async mark(ctx, input, operation) {
      const ref = parseRef(input)
      if (ref === null || !['seen', 'done', 'dismiss', 'restore'].includes(operation))
        return refuse('invalid-request')
      const blocked = await gate(ctx, 'dispose', ref.recipient)
      if (blocked !== null) return blocked
      if (ref.identity.tenant !== ctx.tenant) return refuse('not-found')
      const answer = await deps.store.mark(ctx.tenant, { ref, operation, now: deps.clock.now() })
      if (answer.kind === 'rolled-back') return UNAVAILABLE
      if (answer.kind === 'unknown') return { kind: 'unknown' }
      const result = answer.value
      if (result.kind === 'not-found') return refuse('not-found')
      if (result.kind === 'refused') return refuse(result.reason)
      return { kind: 'done', recalled: result.kind === 'recalled', value: result.marks }
    },
  }
}
