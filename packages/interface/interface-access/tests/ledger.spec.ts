import {
  DEFAULT_MODE,
  type InspectionAsked,
  type InspectionResult,
} from '@omne-harness/interface-protocol'
import { describe, expect, it } from 'vitest'
import { EMPTY_LEDGER, stepLedger, type Ledger, type LedgerEvent } from '../src/ledger.ts'

const POLICY = { dueMs: 30_000, perTenant: 4 }
const ACME = 'tenant-acme'
const BETA = 'tenant-beta'
const asked = (request: string): InspectionAsked => ({ request, page: 'notes', mode: DEFAULT_MODE })
const IMAGE = { kind: 'image', bytes: new Uint8Array([1]), width: 1280, height: 800 } as const

/** Runs events in order and answers the ledger and every effect they asked for. */
function run(events: readonly LedgerEvent[], from: Ledger = EMPTY_LEDGER) {
  let ledger = from
  const effects = []
  for (const event of events) {
    const step = stepLedger(ledger, event, POLICY)
    ledger = step.ledger
    effects.push(...step.effects)
  }
  return { ledger, effects }
}

const arrive = (tenant: string, client: string): LedgerEvent => ({ kind: 'arrive', tenant, client })
const ask = (request: string, tenant = ACME): LedgerEvent => ({
  kind: 'ask',
  tenant,
  asked: asked(request),
  now: 1_000,
})
const deliver = (
  request: string,
  result: InspectionResult,
  client = 'c-1',
  tenant = ACME,
): LedgerEvent => ({
  kind: 'deliver',
  tenant,
  client,
  request,
  result,
})

const EVENTS = {
  image: deliver('r-1', IMAGE),
  cannot: deliver('r-1', { kind: 'cannot', reason: 'no-page' }),
  expire: { kind: 'expire', request: 'r-1' },
  leave: { kind: 'leave', tenant: ACME, client: 'c-1' },
  cancel: { kind: 'cancel', request: 'r-1' },
} as const satisfies Record<string, LedgerEvent>

const present = run([arrive(ACME, 'c-1')]).ledger
const waiting = run([ask('r-1')], present).ledger
const done = run([EVENTS.image], waiting).ledger

describe('the ledger of one request, three states by six events (IV-1)', () => {
  it('none, ask: with a client there it goes to the latest one and waits; with none it is answered at once (IV-2)', () => {
    expect(run([ask('r-1')], present).effects).toEqual([
      { kind: 'send', tenant: ACME, client: 'c-1', asked: asked('r-1') },
    ])
    expect(waiting.pending.get('r-1')).toEqual({ tenant: ACME, client: 'c-1', due: 31_000 })
    expect(run([ask('r-1')]).effects).toEqual([
      { kind: 'settle', request: 'r-1', answer: { kind: 'client-absent' } },
    ])
  })

  it('none: a delivery is not found; expiring, leaving and cancelling change nothing', () => {
    expect(run([EVENTS.image], present).effects).toEqual([
      { kind: 'delivered', outcome: 'not-found' },
    ])
    expect(run([EVENTS.cannot], present).effects).toEqual([
      { kind: 'delivered', outcome: 'not-found' },
    ])
    for (const event of [EVENTS.expire, EVENTS.cancel])
      expect(run([event], present)).toEqual({ ledger: present, effects: [] })
    expect(run([EVENTS.leave], present).effects).toEqual([])
  })

  it('waiting: an image or a reason settles the caller once and the delivery succeeds', () => {
    expect(run([EVENTS.image], waiting).effects).toEqual([
      { kind: 'settle', request: 'r-1', answer: { kind: 'image', image: IMAGE } },
      { kind: 'delivered', outcome: 'succeeded' },
    ])
    expect(run([EVENTS.cannot], waiting).effects).toEqual([
      { kind: 'settle', request: 'r-1', answer: { kind: 'cannot', reason: 'no-page' } },
      { kind: 'delivered', outcome: 'succeeded' },
    ])
  })

  it('waiting: due or its client gone answers unavailable; cancelled it ends without an answer', () => {
    expect(run([EVENTS.expire], waiting).effects).toEqual([
      { kind: 'settle', request: 'r-1', answer: { kind: 'unavailable', why: 'expired' } },
    ])
    expect(run([EVENTS.leave], waiting).effects).toEqual([
      { kind: 'settle', request: 'r-1', answer: { kind: 'unavailable', why: 'client-left' } },
    ])
    const cancelled = run([EVENTS.cancel], waiting)
    expect(cancelled.effects).toEqual([])
    expect(cancelled.ledger.pending.has('r-1')).toBe(false)
  })

  it('done: a late image or reason is not found and the answer stays; nothing else changes it', () => {
    expect(run([EVENTS.image], done).effects).toEqual([{ kind: 'delivered', outcome: 'not-found' }])
    expect(run([EVENTS.cannot], done).effects).toEqual([
      { kind: 'delivered', outcome: 'not-found' },
    ])
    for (const event of [EVENTS.expire, EVENTS.cancel])
      expect(run([event], done).effects).toEqual([])
    expect(run([EVENTS.leave], done).effects).toEqual([])
  })

  it('a tenant has at most so many requests on their way; the next is answered unavailable', () => {
    const full = run(
      ['a', 'b', 'c', 'd'].map(each => ask(each)),
      present,
    )
    expect(full.ledger.pending.size).toBe(4)
    expect(run([ask('e')], full.ledger).effects).toEqual([
      { kind: 'settle', request: 'e', answer: { kind: 'unavailable', why: 'too-many' } },
    ])
  })
})

describe('two tenants, two clients (IV-4)', () => {
  const both = run([arrive(ACME, 'c-1'), arrive(BETA, 'c-2'), arrive(ACME, 'c-3')]).ledger

  it("a request goes to the latest client of the tenant that asks, never to another tenant's", () => {
    expect(run([ask('r-1', ACME)], both).effects[0]).toMatchObject({ client: 'c-3', tenant: ACME })
    expect(run([ask('r-2', BETA)], both).effects[0]).toMatchObject({ client: 'c-2', tenant: BETA })
  })

  it('only the client the request went to can deliver it; another client or tenant is not found', () => {
    const asking = run([ask('r-1', ACME)], both).ledger
    expect(run([deliver('r-1', IMAGE, 'c-1')], asking).effects).toEqual([
      { kind: 'delivered', outcome: 'not-found' },
    ])
    expect(run([deliver('r-1', IMAGE, 'c-2', BETA)], asking).effects).toEqual([
      { kind: 'delivered', outcome: 'not-found' },
    ])
    expect(run([deliver('r-1', IMAGE, 'c-3')], asking).effects[1]).toEqual({
      kind: 'delivered',
      outcome: 'succeeded',
    })
  })

  it('a client that leaves is no longer asked; the one before it is', () => {
    const left = run([{ kind: 'leave', tenant: ACME, client: 'c-3' }], both).ledger
    expect(run([ask('r-1', ACME)], left).effects[0]).toMatchObject({ client: 'c-1' })
  })
})
