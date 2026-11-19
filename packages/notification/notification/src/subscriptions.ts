import {
  consentBasis,
  decideSubscription,
  findEventType,
  parseWith,
  recipientRefSchema,
  sameRecipient,
  subscriptionChangeSchema,
  subscriptionKeySchema,
  type Beat,
  type CallContext,
  type ConsentOutcome,
  type EventTypeDeclaration,
  type NotificationSubscriptions,
  type ParseRefusal,
  type RecipientRef,
  type Subscription,
  type SubscriptionChange,
  type SubscriptionDecision,
  type SubscriptionKey,
  type BeatRefusal,
} from '@omne-harness/notification-contract'
import { ask, type Clock, type NotificationAuthority, type SubscriptionConsents } from './ports.ts'
import type { NotificationSources } from './registries.ts'
import type { NotificationStore } from './store.ts'
import type { RecipientDefaults } from './transactions/destinations.ts'

export type SubscriptionsDependencies = Readonly<{
  authority: NotificationAuthority
  store: NotificationStore
  sources: NotificationSources
  consent: SubscriptionConsents
  clock: Clock
  defaults: RecipientDefaults
  /** The interval a beat may take, in minutes. */
  beatRange: Readonly<{ min: number; max: number }>
}>

const UNAVAILABLE = { kind: 'basis-unavailable' } as const
const UNREAD: ConsentOutcome = { kind: 'unavailable' }
const refuse = <R extends string>(reason: R) => ({ kind: 'refused', reason }) as const
type Blocked = typeof UNAVAILABLE | ReturnType<typeof refuse<'not-permitted'>>

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
  function beatRefusal(ctx: CallContext, beat: Beat): BeatRefusal | null {
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

  /** Null: something the decision needs cannot be read right now. */
  function decide(
    ctx: CallContext,
    change: SubscriptionChange,
    current: Subscription | null,
  ): SubscriptionDecision | null {
    const declared = declaredType(deps.sources, change)
    if (declared === null) return null
    try {
      return decideSubscription({
        change,
        current,
        actor: ctx.actor,
        declared,
        now: deps.clock.now(),
      })
    } catch {
      return null
    }
  }

  /** What the agent's call was released on; an answer that cannot be had is unavailable. */
  async function consentOf(ctx: CallContext): Promise<ConsentOutcome> {
    try {
      return consentBasis(await deps.consent.consent(ctx))
    } catch {
      return UNREAD
    }
  }

  /** The decision, with the consent of the call read in when it needs one. */
  async function settle(
    ctx: CallContext,
    change: SubscriptionChange,
    current: Subscription | null,
  ): Promise<Exclude<SubscriptionDecision, { kind: 'needs-consent' }> | typeof UNAVAILABLE> {
    const decision = decide(ctx, change, current)
    if (decision === null) return UNAVAILABLE
    if (decision.kind !== 'needs-consent') return decision
    const consent = await consentOf(ctx)
    if (consent.kind === 'unavailable') return UNAVAILABLE
    return consent.kind === 'basis' ? { kind: 'set', basis: consent.basis } : consent
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
    async set(ctx, input) {
      const parsed = parseWith(subscriptionChangeSchema, input)
      if ('refused' in parsed) return refuse(parseRefusal(parsed.refused))
      const change = parsed.ok
      const { level, note, term, ...key } = change
      const blocked = await gate(ctx, 'subscribe-for', change.recipient)
      if (blocked !== null) return blocked
      const current = await deps.store.subscription(ctx.tenant, key)
      if (current.kind === 'unavailable') return UNAVAILABLE
      const settled = await settle(ctx, change, current.value)
      if (settled.kind === 'recalled')
        return { kind: 'done', recalled: true, value: settled.current }
      if (settled.kind !== 'set') return settled
      const next = { ...key, level, note, term, basis: settled.basis, expired: false }
      const failed = await write(ctx, key, current.value, next)
      return failed ?? { kind: 'done', recalled: false, value: next }
    },

    async remove(ctx, input) {
      const parsed = parseWith(subscriptionKeySchema, input)
      if ('refused' in parsed) return refuse(keyRefusal(parsed.refused))
      const key = parsed.ok
      if (!isOwn(ctx, key.recipient)) return refuse('not-own-recipient')
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

    async beat(ctx, input) {
      const recipient = parseWith(recipientRefSchema, input)
      if ('refused' in recipient) return refuse('invalid-request')
      const blocked = await gate(ctx, 'read-inbox', recipient.ok)
      if (blocked !== null) return blocked
      const read = await deps.store.beat(ctx.tenant, recipient.ok)
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

const keyRefusal = (refusal: ParseRefusal) =>
  refusal === 'invalid-scope' ? refusal : 'invalid-request'

/** The owner acts for any recipient of the tenant; an agent only for itself. */
const isOwn = (ctx: CallContext, recipient: RecipientRef) =>
  ctx.actor.kind === 'owner' || sameRecipient(ctx.actor.recipient, recipient)

const parseRefusal = (refusal: ParseRefusal) =>
  refusal === 'invalid-scope' || refusal === 'invalid-term' ? refusal : 'invalid-request'

const sameBeat = (a: Beat, b: Beat) =>
  a.kind === b.kind && (a.kind !== 'every' || (b.kind === 'every' && a.minutes === b.minutes))
