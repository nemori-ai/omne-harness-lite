import {
  instantSchema,
  tenantIdSchema,
  type Actor,
  type AuthorityAnswer,
  type CallContext,
  type ConsentMode,
  type Instant,
} from '@omne-harness/notification-contract'
import type { AuthorityAction, Clock, ConsentModes, NotificationAuthority } from '../ports.ts'

export type FakeAuthority = NotificationAuthority &
  Readonly<{
    /** Decides how the authority answers from now on. The default allows everything. */
    answer(rule: (ctx: CallContext, action: AuthorityAction) => AuthorityAnswer | 'throw'): void
    /** Every question asked so far, in order. */
    asked(): readonly AuthorityAction[]
  }>

export function fakeAuthority(): FakeAuthority {
  let rule: (ctx: CallContext, action: AuthorityAction) => AuthorityAnswer | 'throw' = () =>
    'allowed'
  const asked: AuthorityAction[] = []
  return {
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

export type FakeConsent = ConsentModes &
  Readonly<{ set(mode: ConsentMode | 'unavailable' | 'throw'): void }>

/** The owner's consent mode. The default is per-request. */
export function fakeConsent(): FakeConsent {
  let current: ConsentMode | 'unavailable' | 'throw' = { kind: 'per-request' }
  return {
    set(mode) {
      current = mode
    },
    async mode() {
      if (current === 'throw') throw new Error('settings are down')
      return current
    },
  }
}
