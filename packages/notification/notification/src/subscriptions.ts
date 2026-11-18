import {
  decideSubscription,
  findEventType,
  parseWith,
  recipientRefSchema,
  sameRecipient,
  subscriptionChangeSchema,
  subscriptionKeySchema,
  type Beat,
  type CallContext,
  type Confirmation,
  type ConsentMode,
  type EventTypeDeclaration,
  type NotificationSubscriptions,
  type ParseRefusal,
  type RecipientRef,
  type Subscription,
  type SubscriptionActor,
  type SubscriptionChange,
  type SubscriptionDecision,
  type SubscriptionKey,
  type SubscriptionRefusal,
} from '@omne-harness/notification-contract'
import { ask, type Clock, type ConsentModes, type NotificationAuthority } from './ports.ts'
import type { NotificationSources } from './registries.ts'
import type { NotificationStore } from './store.ts'
import type { RecipientDefaults } from './transactions/destinations.ts'

export type SubscriptionsDependencies = Readonly<{
  authority: NotificationAuthority
  store: NotificationStore
  sources: NotificationSources
  consent: ConsentModes
  clock: Clock
  defaults: RecipientDefaults
  /** The interval a beat may take, in minutes. */
  beatRange: Readonly<{ min: number; max: number }>
}>

const UNAVAILABLE = { kind: 'basis-unavailable' } as const
const refuse = (reason: SubscriptionRefusal) => ({ kind: 'refused', reason }) as const
type Blocked = typeof UNAVAILABLE | ReturnType<typeof refuse>

const actorOf = (ctx: CallContext): SubscriptionActor =>
  ctx.actor.kind === 'owner' ? ctx.actor : { kind: 'agent', recipient: ctx.actor.recipient }

function declaredType(
  sources: NotificationSources,
  key: SubscriptionKey,
): EventTypeDeclaration | null {
  try {
    const source = sources.lookup(key.source)
    return source.kind === 'registered' ? findEventType(source.declaration, key.type) : null
  } catch {
    return null
  }
}

export function createSubscriptions(deps: SubscriptionsDependencies): NotificationSubscriptions {
  /** Only the owner sets a beat, and only within the governed range. */
  function beatRefusal(ctx: CallContext, beat: Beat): SubscriptionRefusal | null {
    if (!validBeat(beat)) return 'invalid-request'
    if (ctx.actor.kind !== 'owner') return 'not-permitted'
    const { min, max } = deps.beatRange
    return beat.kind === 'every' && (beat.minutes < min || beat.minutes > max)
      ? 'out-of-range'
      : null
  }

  async function gate(
    ctx: CallContext,
    kind: 'subscribe-for' | 'read-inbox',
    recipient: RecipientRef,
  ): Promise<Blocked | null> {
    const answer = await ask(deps.authority, ctx, { kind, recipient })
    if (answer === 'denied') return refuse('not-permitted')
    return answer === 'unavailable' ? UNAVAILABLE : null
  }

  /** Read only when an agent acts: the owner needs nobody's consent. */
  async function consentMode(ctx: CallContext): Promise<ConsentMode | null | 'unavailable'> {
    if (ctx.actor.kind === 'owner') return null
    try {
      return await deps.consent.mode(ctx)
    } catch {
      return 'unavailable'
    }
  }

  /** Null: something the decision needs cannot be read right now. */
  async function decide(
    ctx: CallContext,
    change: SubscriptionChange,
    current: Subscription | null,
    confirmation: Confirmation | null,
  ): Promise<SubscriptionDecision | null> {
    const declared = declaredType(deps.sources, change)
    const mode = await consentMode(ctx)
    if (declared === null || mode === 'unavailable') return null
    const facts = { tenant: ctx.tenant, change, current, actor: actorOf(ctx), declared }
    try {
      return decideSubscription({ ...facts, mode, confirmation, now: deps.clock.now() })
    } catch {
      return null
    }
  }

  async function write(
    ctx: CallContext,
    key: SubscriptionKey,
    expected: Subscription | null,
    next: Subscription | null,
  ): Promise<Blocked | { kind: 'unknown' } | null> {
    const command = { key, expected, next, defaults: deps.defaults }
    const answer = await deps.store.subscribe(ctx.tenant, command)
    if (answer.kind === 'unknown') return { kind: 'unknown' }
    return answer.kind === 'rolled-back' || answer.value.kind === 'stale' ? UNAVAILABLE : null
  }

  return {
    async set(ctx, input, confirmation = null) {
      const parsed = parseWith(subscriptionChangeSchema, input)
      if ('refused' in parsed) return refuse(parseRefusal(parsed.refused))
      const change = parsed.ok
      const { level, note, term, ...key } = change
      const blocked = await gate(ctx, 'subscribe-for', change.recipient)
      if (blocked !== null) return blocked
      const current = await deps.store.subscription(ctx.tenant, key)
      if (current.kind === 'unavailable') return UNAVAILABLE
      const decision = await decide(ctx, change, current.value, confirmation)
      if (decision === null) return UNAVAILABLE
      if (decision.kind === 'refused') return decision
      if (decision.kind === 'recalled')
        return { kind: 'done', recalled: true, value: decision.current }
      if (decision.kind === 'needs-confirmation')
        return { kind: 'needs-confirmation', request: { content: decision.content, change } }
      const next = { ...key, level, note, term, basis: decision.basis, expired: false }
      const failed = await write(ctx, key, current.value, next)
      return failed ?? { kind: 'done', recalled: false, value: next }
    },

    async remove(ctx, input) {
      const parsed = parseWith(subscriptionKeySchema, input)
      if ('refused' in parsed) return refuse(parseRefusal(parsed.refused))
      const key = parsed.ok
      const own = ctx.actor.kind === 'owner' || sameRecipient(ctx.actor.recipient, key.recipient)
      if (!own) return refuse('not-own-recipient')
      const blocked = await gate(ctx, 'subscribe-for', key.recipient)
      if (blocked !== null) return blocked
      const current = await deps.store.subscription(ctx.tenant, key)
      if (current.kind === 'unavailable') return UNAVAILABLE
      if (current.value === null) return { kind: 'done', recalled: true, value: null }
      const failed = await write(ctx, key, current.value, null)
      return failed ?? { kind: 'done', recalled: false, value: null }
    },

    async list(ctx, input) {
      const recipient = parseWith(recipientRefSchema, input)
      if ('refused' in recipient) return refuse('invalid-request')
      const blocked = await gate(ctx, 'read-inbox', recipient.ok)
      if (blocked !== null) return blocked
      const read = await deps.store.subscriptions(ctx.tenant, recipient.ok)
      if (read.kind === 'unavailable') return UNAVAILABLE
      return { kind: 'done', recalled: false, value: read.value }
    },

    async setBeat(ctx, input, beat) {
      const recipient = parseWith(recipientRefSchema, input)
      if ('refused' in recipient) return refuse('invalid-request')
      const refusal = beatRefusal(ctx, beat)
      if (refusal !== null) return refuse(refusal)
      const blocked = await gate(ctx, 'subscribe-for', recipient.ok)
      if (blocked !== null) return blocked
      const current = await deps.store.beat(ctx.tenant, recipient.ok)
      if (current.kind === 'unavailable') return UNAVAILABLE
      if (sameBeat(current.value, beat)) return { kind: 'done', recalled: true, value: beat }
      const answer = await deps.store.setBeat(ctx.tenant, { recipient: recipient.ok, beat })
      if (answer.kind === 'unknown') return { kind: 'unknown' }
      if (answer.kind === 'rolled-back') return UNAVAILABLE
      return { kind: 'done', recalled: false, value: beat }
    },
  }
}

function validBeat(beat: Beat): boolean {
  if (beat?.kind === 'default' || beat?.kind === 'off') return true
  return beat?.kind === 'every' && Number.isInteger(beat.minutes) && beat.minutes > 0
}

const parseRefusal = (refusal: ParseRefusal): SubscriptionRefusal =>
  refusal === 'invalid-scope' || refusal === 'invalid-term' ? refusal : 'invalid-request'

const sameBeat = (a: Beat, b: Beat) =>
  a.kind === b.kind && (a.kind !== 'every' || (b.kind === 'every' && a.minutes === b.minutes))
