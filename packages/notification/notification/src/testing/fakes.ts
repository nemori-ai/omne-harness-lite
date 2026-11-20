import {
  channelNameSchema,
  instantSchema,
  tenantIdSchema,
  type Actor,
  type AuthorityAnswer,
  type CallContext,
  type ChannelContribution,
  type ChannelDelivery,
  type Creator,
  type DeliveryResult,
  type Disclosure,
  type Instant,
  type StandingRead,
  type TenantId,
} from '@omne-harness/notification-contract'
import type {
  AuthorityAction,
  Clock,
  ClockHints,
  NotificationAuthority,
  StandingItems,
  SubscriptionCreators,
} from '../ports.ts'

export type FakeAuthority = NotificationAuthority &
  Readonly<{
    /** Decides how the authority answers from now on. The default allows everything. */
    answer(rule: (ctx: CallContext, action: AuthorityAction) => AuthorityAnswer | 'throw'): void
    asked(): readonly AuthorityAction[]
    /** Decides what may leave the system from now on. The default discloses everything. */
    disclose(next: Disclosure | 'unavailable' | 'throw'): void
  }>

export function fakeAuthority(): FakeAuthority {
  let rule: (ctx: CallContext, action: AuthorityAction) => AuthorityAnswer | 'throw' = () =>
    'allowed'
  const asked: AuthorityAction[] = []
  let disclosure: Disclosure | 'unavailable' | 'throw' = { kind: 'full' }
  return {
    disclose(next) {
      disclosure = next
    },
    async disclosure() {
      if (disclosure === 'throw') throw new Error('authority is down')
      return disclosure
    },
    answer(next) {
      rule = next
    },
    asked: () => asked,
    async decide(ctx, action) {
      asked.push(action)
      const answer = rule(ctx, action)
      if (answer === 'throw') throw new Error('authority is down')
      return answer
    },
  }
}

export type FakeClock = Clock & Readonly<{ set(instant: string): void; advance(ms: number): void }>

export function fakeClock(start = '2026-11-18T06:00:00.000Z'): FakeClock {
  let current: Instant = instantSchema.parse(start)
  return {
    now: () => current,
    set(instant) {
      current = instantSchema.parse(instant)
    },
    advance(ms) {
      current = instantSchema.parse(new Date(Date.parse(current) + ms).toISOString())
    },
  }
}

export function context(tenant = 't1', actor: Actor = { kind: 'owner' }): CallContext {
  return { tenant: tenantIdSchema.parse(tenant), subject: { test: tenant }, actor }
}

export type FakeCreators = SubscriptionCreators &
  Readonly<{ set(answer: Creator | null | 'throw'): void; asked: readonly CallContext[] }>

/** The default names the owner a human `owner`, and an agent by its recipient reference and the
 * call of its context; an agent's context without a call has no creator. */
function namedIn(ctx: CallContext): Creator | null {
  if (ctx.actor.kind === 'owner') return { kind: 'human', actorRef: 'owner' }
  const { ref } = ctx.actor.recipient
  return ctx.call === undefined
    ? null
    : { kind: 'agent', actorRef: ref, originatingSessionRef: ref, originatingCallRef: ctx.call }
}

/** Who acts in a context, as an adapter would name it, until a test sets a fixed answer. */
export function fakeCreators(): FakeCreators {
  let fixed: Creator | null | 'throw' | undefined
  const asked: CallContext[] = []
  return {
    asked,
    set(answer) {
      fixed = answer
    },
    async creatorOf(ctx) {
      asked.push(ctx)
      if (fixed === 'throw') throw new Error('the creator cannot be named')
      return fixed === undefined ? namedIn(ctx) : fixed
    },
  }
}

export type FakeChannel = ChannelContribution &
  Readonly<{
    deliveries: ChannelDelivery[]
    /** Answers the following deliveries in turn, then goes back to `delivered`. */
    answer(...results: readonly (DeliveryResult | 'throw' | 'hang')[]): void
  }>

/** A channel that records what it is asked to deliver. */
export function fakeChannel(
  name: string,
  options: Partial<Pick<ChannelContribution, 'leavesSystem' | 'defaultMinIntervalMs'>> = {},
): FakeChannel {
  const queue: (DeliveryResult | 'throw' | 'hang')[] = []
  const deliveries: ChannelDelivery[] = []
  return {
    name: channelNameSchema.parse(name),
    label: name,
    address: { hint: 'anything but "bad"', accepts: address => address !== 'bad' },
    leavesSystem: options.leavesSystem ?? false,
    defaultMinIntervalMs: options.defaultMinIntervalMs ?? 0,
    deliveries,
    answer(...results) {
      queue.push(...results)
    },
    async deliver(delivery) {
      deliveries.push(delivery)
      const next = queue.shift() ?? { kind: 'delivered' }
      if (next === 'throw') throw new Error('channel is down')
      if (next === 'hang') return new Promise(() => {})
      return next
    },
  }
}

export type FakeStanding = StandingItems & Readonly<{ set(read: StandingRead | 'throw'): void }>

/** The standing items the sources publish. The default is that there are none. */
export function fakeStanding(): FakeStanding {
  let current: StandingRead | 'throw' = { kind: 'ok', items: [] }
  return {
    set(read) {
      current = read
    },
    async read() {
      if (current === 'throw') throw new Error('runtime context is down')
      return current
    },
  }
}

export type FakeHints = ClockHints & Readonly<{ wakes: { tenant: TenantId; at: Instant }[] }>

export function fakeHints(): FakeHints {
  const wakes: { tenant: TenantId; at: Instant }[] = []
  return { wakes, wakeAt: (tenant, at) => void wakes.push({ tenant, at }) }
}
