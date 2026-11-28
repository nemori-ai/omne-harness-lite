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

const arrive = (
  tenant: string,
  client: string,
  revision = 1,
  channel: 'look' | 'now' = 'look',
): LedgerEvent => ({ kind: 'arrive', tenant, client, channel, revision })
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
  leave: { kind: 'leave', tenant: ACME, client: 'c-1', channel: 'look' },
  cancel: { kind: 'cancel', request: 'r-1' },
} as const satisfies Record<string, LedgerEvent>

const present = run([arrive(ACME, 'c-1')]).ledger
const waiting = run([ask('r-1')], present).ledger
const done = run([EVENTS.image], waiting).ledger

describe('the ledger of one request, three states by six events (IV-1)', () => {
  it('none, ask: with a client there it goes to the latest one and waits; with none it is answered at once (IV-2)', () => {
    expect(run([ask('r-1')], present).effects).toEqual([
      { kind: 'send', tenant: ACME, client: 'c-1', channel: 'look', asked: asked('r-1') },
    ])
    expect(waiting.pending.get('r-1')).toEqual({
      tenant: ACME,
      client: 'c-1',
      due: 31_000,
      want: 'look',
    })
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
    const left = run([{ kind: 'leave', tenant: ACME, client: 'c-3', channel: 'look' }], both).ledger
    expect(run([ask('r-1', ACME)], left).effects[0]).toMatchObject({ client: 'c-1' })
  })

  it("another tenant's requests on their way do not count toward this tenant's limit", () => {
    const betaFull = run(
      ['a', 'b', 'c', 'd'].map(each => ask(each, BETA)),
      both,
    ).ledger
    expect(run([ask('r-1', ACME)], betaFull).effects).toEqual([
      { kind: 'send', tenant: ACME, client: 'c-3', channel: 'look', asked: asked('r-1') },
    ])
  })

  it('a delivery from a client of the same name under another tenant is not found', () => {
    const twins = run([arrive(ACME, 'c-9'), arrive(BETA, 'c-9'), ask('r-1', ACME)]).ledger
    expect(run([deliver('r-1', IMAGE, 'c-9', BETA)], twins).effects).toEqual([
      { kind: 'delivered', outcome: 'not-found' },
    ])
  })

  it('a client that leaves takes only its own requests: not those of a client of the same name under another tenant, nor of another client of its tenant', () => {
    const twins = run([
      arrive(ACME, 'c-9'),
      ask('r-1', ACME),
      arrive(BETA, 'c-9'),
      ask('r-2', BETA),
      arrive(ACME, 'c-8'),
      ask('r-3', ACME),
    ]).ledger
    const left = run([{ kind: 'leave', tenant: ACME, client: 'c-9', channel: 'look' }], twins)
    expect(left.effects).toEqual([
      { kind: 'settle', request: 'r-1', answer: { kind: 'unavailable', why: 'client-left' } },
    ])
    expect([...left.ledger.pending.keys()]).toEqual(['r-2', 'r-3'])
    expect(run([{ kind: 'expire', request: 'r-1' }], left.ledger).effects).toEqual([])
  })

  it('a tenant whose only client arrived and left has no one to ask; a leave of a tenant with none changes nothing', () => {
    expect(run([arrive(ACME, 'c-1')]).effects).toEqual([])
    const gone = run([
      arrive(ACME, 'c-1'),
      { kind: 'leave', tenant: ACME, client: 'c-1', channel: 'look' },
    ]).ledger
    expect(run([ask('r-1', ACME)], gone).effects).toEqual([
      { kind: 'settle', request: 'r-1', answer: { kind: 'client-absent' } },
    ])
    expect(run([{ kind: 'leave', tenant: BETA, client: 'c-2', channel: 'look' }]).ledger).toEqual(
      EMPTY_LEDGER,
    )
  })
})

const STRUCTURE = {
  page: 'notes',
  width: 1280,
  height: 800,
  parts: [],
  layers: [{ role: 'dialog', label: '禁用', text: '禁用整份' }],
  more: 0,
} as const
const askNow = (request: string, until = false): LedgerEvent => ({
  kind: 'ask',
  tenant: ACME,
  asked: {
    request,
    want: 'structure',
    ...(until && { until: { part: 'weather.card', seconds: 5 } }),
  },
  now: 1_000,
})
const seen = (met: boolean, request = 'n-1'): LedgerEvent => ({
  kind: 'deliver-seen',
  tenant: ACME,
  client: 'c-2',
  request,
  result: { kind: 'structure', structure: STRUCTURE },
  met,
})

describe('a question of now, and what a client of each revision is sent (IV-6)', () => {
  const older = run([arrive(ACME, 'c-1', 1)]).ledger
  const mixed = run([arrive(ACME, 'c-2', 2, 'now'), arrive(ACME, 'c-1', 1)]).ledger
  const asking = run([askNow('n-1', true)], mixed).ledger

  it('none, ask now: no client is client-absent; clients that do not observe now are unsupported at once', () => {
    expect(run([askNow('n-1')]).effects).toEqual([
      { kind: 'settle', request: 'n-1', answer: { kind: 'client-absent' } },
    ])
    expect(run([askNow('n-1')], older).effects).toEqual([
      { kind: 'settle', request: 'n-1', answer: { kind: 'cannot', reason: 'unsupported' } },
    ])
  })

  it('none, ask now: it goes to the latest client that observes now, though another came later', () => {
    const asked = run([askNow('n-1', true)], mixed)
    expect(asked.effects).toEqual([
      {
        kind: 'send',
        tenant: ACME,
        client: 'c-2',
        channel: 'now',
        asked: { request: 'n-1', want: 'structure', until: { part: 'weather.card', seconds: 5 } },
      },
    ])
    expect(asked.ledger.pending.get('n-1')).toMatchObject({ client: 'c-2', want: 'now' })
  })

  it('none, ask a look that names a part: a client before revision 2 cannot read it; a plain look still goes', () => {
    const named: LedgerEvent = {
      kind: 'ask',
      tenant: ACME,
      asked: { ...asked('r-1'), part: 'weather.card' },
      now: 1_000,
    }
    expect(run([named], older).effects).toEqual([
      { kind: 'settle', request: 'r-1', answer: { kind: 'cannot', reason: 'unsupported' } },
    ])
    expect(run([ask('r-1')], older).effects[0]).toMatchObject({ kind: 'send', client: 'c-1' })
  })

  it('waiting now: what it saw settles the caller, and says whether what was waited for came', () => {
    expect(run([seen(true)], asking).effects).toEqual([
      {
        kind: 'settle',
        request: 'n-1',
        answer: { kind: 'seen', seen: { kind: 'structure', structure: STRUCTURE }, met: true },
      },
      { kind: 'delivered', outcome: 'succeeded' },
    ])
    expect(run([seen(false)], asking).effects[0]).toMatchObject({
      answer: { kind: 'seen', met: false },
    })
  })

  it('waiting now: a delivery of the other kind or from another client is not found, and it still waits', () => {
    const look: LedgerEvent = {
      kind: 'deliver',
      tenant: ACME,
      client: 'c-2',
      request: 'n-1',
      result: IMAGE,
    }
    const elsewhere: LedgerEvent = { ...seen(true), client: 'c-1' } as LedgerEvent
    for (const event of [look, elsewhere]) {
      const step = run([event], asking)
      expect(step.effects).toEqual([{ kind: 'delivered', outcome: 'not-found' }])
      expect(step.ledger.pending.has('n-1')).toBe(true)
    }
    expect(run([seen(true, 'r-1')], waiting).effects).toEqual([
      { kind: 'delivered', outcome: 'not-found' },
    ])
  })

  it('waiting now: a reason settles it as cannot; due or its client gone is unavailable', () => {
    const cannot: LedgerEvent = {
      kind: 'deliver-seen',
      tenant: ACME,
      client: 'c-2',
      request: 'n-1',
      result: { kind: 'cannot', reason: 'unsupported' },
      met: false,
    }
    expect(run([cannot], asking).effects[0]).toEqual({
      kind: 'settle',
      request: 'n-1',
      answer: { kind: 'cannot', reason: 'unsupported' },
    })
    expect(run([{ kind: 'expire', request: 'n-1' }], asking).effects).toEqual([
      { kind: 'settle', request: 'n-1', answer: { kind: 'unavailable', why: 'expired' } },
    ])
    expect(
      run([{ kind: 'leave', tenant: ACME, client: 'c-2', channel: 'now' }], asking).effects,
    ).toEqual([
      { kind: 'settle', request: 'n-1', answer: { kind: 'unavailable', why: 'client-left' } },
    ])
    const lookGone: LedgerEvent = { kind: 'leave', tenant: ACME, client: 'c-2', channel: 'look' }
    expect(run([lookGone], asking).ledger.pending.has('n-1')).toBe(true)
  })

  it('done now: a late delivery is not found', () => {
    const answered = run([seen(true)], asking).ledger
    expect(run([seen(true)], answered).effects).toEqual([
      { kind: 'delivered', outcome: 'not-found' },
    ])
  })
})
