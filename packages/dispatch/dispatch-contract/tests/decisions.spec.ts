import { describe, expect, it } from 'vitest'
import {
  decideAccept,
  decideMessage,
  deliveryDue,
  settleDelivery,
  type AcceptFacts,
  type DeliveryObservation,
  type Dispatch,
  type MessageFacts,
  type SessionRef,
} from '@omne-harness/dispatch-contract'

const sound: AcceptFacts = {
  mode: 'delegate',
  permitted: true,
  dispatcher: { depth: 0, archived: false },
  agentType: 'non-master',
  open: 0,
  maxOpen: 4,
  contextCopy: true,
}
const accept = (change: Partial<AcceptFacts>) => decideAccept({ ...sound, ...change })
const refuse = (reason: string) => ({ kind: 'refuse', reason })

describe('a request that does not hold when it is asked for is refused with its reason', () => {
  it('accepts a sound request in each mode', () => {
    expect(accept({})).toEqual({ kind: 'accept' })
    expect(accept({ mode: 'spawn' })).toEqual({ kind: 'accept' })
    expect(accept({ mode: 'handoff', agentType: 'master' })).toEqual({ kind: 'accept' })
  })

  it.each([
    ['the principal may not dispatch now', { permitted: false }, 'not-permitted'],
    [
      'the dispatching session is archived',
      { dispatcher: { depth: 0, archived: true } },
      'dispatcher-archived',
    ],
    ['the tenant sees no definition of that name', { agentType: null }, 'unknown-agent'],
    ['a handoff to a definition that is not master', { mode: 'handoff' }, 'agent-not-master'],
    ['as many open dispatches as the limit', { open: 4 }, 'too-many-open'],
    [
      'a spawn whose context copy cannot be given',
      { mode: 'spawn', contextCopy: false },
      'context-unavailable',
    ],
  ] as const)('%s', (_label, change, reason) => {
    expect(accept(change)).toEqual(refuse(reason))
  })

  it('a session on layer 2 dispatches no spawn and no delegate, and still hands off', () => {
    const deep = { dispatcher: { depth: 2, archived: false } }
    expect(accept({ ...deep, mode: 'spawn' })).toEqual(refuse('too-deep'))
    expect(accept({ ...deep, mode: 'delegate' })).toEqual(refuse('too-deep'))
    expect(accept({ ...deep, mode: 'handoff', agentType: 'master' })).toEqual({ kind: 'accept' })
    expect(accept({ dispatcher: { depth: 1, archived: false } })).toEqual({ kind: 'accept' })
  })

  it('needs no context copy for a delegate or a handoff, and one less than the limit is open', () => {
    expect(accept({ contextCopy: false })).toEqual({ kind: 'accept' })
    expect(accept({ open: 3 })).toEqual({ kind: 'accept' })
  })

  it('names the permission first, whatever else does not hold', () => {
    expect(accept({ permitted: false, agentType: null, open: 9 })).toEqual(refuse('not-permitted'))
  })
})

const a = 'session-a' as SessionRef
const b = 'session-b' as SessionRef
const fit: MessageFacts = { permitted: true, sender: a, to: b, receiver: { archived: false } }
const message = (change: Partial<MessageFacts>) => decideMessage({ ...fit, ...change })

describe('a message goes between any two open sessions of one tenant', () => {
  it('is sent without any dispatch relation between the two', () => {
    expect(message({})).toEqual({ kind: 'send' })
  })

  it.each([
    ['the sender may not send now', { permitted: false }, 'not-permitted'],
    ['it is addressed to the sender', { to: a }, 'to-self'],
    [
      'the tenant has no such session, or it is of another tenant',
      { receiver: null },
      'no-such-session',
    ],
    ['the receiver is archived', { receiver: { archived: true } }, 'archived'],
  ] as const)('%s', (_label, change, reason) => {
    expect(message(change)).toEqual(refuse(reason))
  })

  it('does not say whether the session exists to a sender that may not send', () => {
    expect(message({ permitted: false, receiver: null })).toEqual(refuse('not-permitted'))
  })
})

type Outcome = Pick<Dispatch, 'state' | 'delivery'>
const due = (state: Dispatch['state']): Outcome => ({ state, delivery: { kind: 'pending' } })
const seen = (change: Partial<DeliveryObservation>): DeliveryObservation => ({
  wait: 'closed',
  input: 'absent',
  archived: false,
  ...change,
})
const record = (delivery: object) => ({ kind: 'record', delivery })
const HOLD = { kind: 'hold' }

describe('an outcome is handed over at exactly one place', () => {
  it('is due only while its delivery is pending', () => {
    expect(deliveryDue(due('reported'))).toBe(true)
    expect(deliveryDue({ delivery: null })).toBe(false)
    expect(deliveryDue({ delivery: { kind: 'delivered', to: 'result' } })).toBe(false)
  })

  it('takes no step for a dispatch whose delivery is not pending', () => {
    expect(settleDelivery({ state: 'started', delivery: null }, seen({}))).toEqual(HOLD)
    expect(
      settleDelivery({ state: 'reported', delivery: { kind: 'undeliverable' } }, seen({})),
    ).toEqual(HOLD)
  })

  it.each(['reported', 'failed', 'withdrawn', 'handed-off'] as const)(
    'the wait took the outcome of a %s dispatch: it is the result of the call',
    state => {
      expect(settleDelivery(due(state), seen({ wait: 'delivered' }))).toEqual(
        record({ kind: 'delivered', to: 'result' }),
      )
    },
  )

  it('sends nothing while the wait cannot be read, whatever else is known', () => {
    for (const state of ['reported', 'failed', 'withdrawn'] as const)
      expect(settleDelivery(due(state), seen({ wait: 'unreadable' }))).toEqual(HOLD)
  })

  it('a report whose wait is closed goes into the dispatching session as an input', () => {
    expect(settleDelivery(due('reported'), seen({}))).toEqual({ kind: 'send-input' })
  })

  it('an input that is already there is recorded, and not sent again', () => {
    expect(settleDelivery(due('reported'), seen({ input: 'present' }))).toEqual(
      record({ kind: 'delivered', to: 'input' }),
    )
    expect(settleDelivery(due('reported'), seen({ input: 'present', archived: true }))).toEqual(
      record({ kind: 'delivered', to: 'input' }),
    )
  })

  it('a report for an archived dispatcher that got no input is undeliverable', () => {
    expect(settleDelivery(due('reported'), seen({ archived: true }))).toEqual(
      record({ kind: 'undeliverable' }),
    )
  })

  it('holds while it is not known whether the input is there or the dispatcher is archived', () => {
    expect(settleDelivery(due('reported'), seen({ input: 'unknown' }))).toEqual(HOLD)
    expect(settleDelivery(due('reported'), seen({ archived: 'unknown' }))).toEqual(HOLD)
  })

  it.each(['failed', 'withdrawn', 'handed-off'] as const)(
    'a %s dispatch whose wait is closed has no second place: nothing is sent',
    state => {
      expect(settleDelivery(due(state), seen({}))).toEqual(record({ kind: 'wait-closed' }))
      expect(settleDelivery(due(state), seen({ input: 'unknown', archived: 'unknown' }))).toEqual(
        record({ kind: 'wait-closed' }),
      )
    },
  )
})
