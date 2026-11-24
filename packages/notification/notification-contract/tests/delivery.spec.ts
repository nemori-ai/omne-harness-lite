import { describe, expect, it } from 'vitest'
import {
  beatSlot,
  composeBody,
  planBeat,
  planRetry,
  planStrong,
  redact,
  remindable,
  unitId,
  UNMARKED,
  type BoxEntry,
  type DestinationFacts,
  type Marks,
  type RecipientRef,
  type RetryPolicy,
} from '@omne-harness/notification-contract'
import { agent, at, identity, person, source, typeName } from './fixtures.ts'

function entry(eventId: string, overrides: Partial<BoxEntry> = {}): BoxEntry {
  return {
    identity: identity(eventId),
    recipient: person,
    sequence: 1,
    level: 'strong',
    cause: { kind: 'type-default' },
    acceptedAt: at(0),
    marks: UNMARKED,
    replaceKey: null,
    quiet: false,
    source,
    type: typeName,
    title: `Title ${eventId}`,
    body: `Body of ${eventId}`,
    locator: { kind: 'thing', ref: eventId },
    external: false,
    ...overrides,
  }
}

function facts(overrides: Partial<DestinationFacts> = {}): DestinationFacts {
  return {
    enabled: true,
    minLevel: 'weak',
    lastStrongAt: null,
    channelPresent: true,
    minIntervalMs: 10 * 60_000,
    ...overrides,
  }
}

const nothing = { kind: 'nothing' }

describe('planStrong', () => {
  const pending = [entry('e1'), entry('e2', { sequence: 2 })]

  it('forms a unit of everything pending when no strong unit went out before', () => {
    expect(planStrong(at(5), facts(), pending)).toEqual({ kind: 'form', members: pending })
  })

  it('waits until the minimum interval after the last strong unit has passed', () => {
    const last = facts({ lastStrongAt: at(0) })
    expect(planStrong(at(9), last, pending)).toEqual({ kind: 'wait', until: at(10) })
    expect(planStrong(at(10), last, pending)).toEqual({ kind: 'form', members: pending })
    expect(planStrong(at(11), last, pending)).toEqual({ kind: 'form', members: pending })
  })

  it('does not form early however much is pending', () => {
    const many = Array.from({ length: 500 }, (_, index) => entry(`e${index}`, { sequence: index }))
    expect(planStrong(at(1), facts({ lastStrongAt: at(0) }), many)).toEqual({
      kind: 'wait',
      until: at(10),
    })
  })

  it.each([
    ['nothing is pending', facts(), []],
    ['nothing is pending inside the interval', facts({ lastStrongAt: at(0) }), []],
    ['the destination is disabled', facts({ enabled: false }), pending],
    ['the channel is absent', facts({ channelPresent: false }), pending],
  ])('does nothing when %s', (_case, destination, entries) => {
    expect(planStrong(at(5), destination, entries)).toEqual(nothing)
  })

  it('forms for a destination that takes strong units only', () => {
    expect(planStrong(at(5), facts({ minLevel: 'strong' }), pending).kind).toBe('form')
  })
})

describe('beatSlot', () => {
  it('starts at a whole multiple of the interval and moves at the boundary', () => {
    expect(beatSlot(at(29), 30).start).toBe(at(0))
    expect(beatSlot(at(30), 30).start).toBe(at(30))
    expect(beatSlot(at(30), 30).index).toBe(beatSlot(at(29), 30).index + 1)
    expect(beatSlot(at(59), 30).index).toBe(beatSlot(at(30), 30).index)
  })
})

describe('remindable', () => {
  const marked = (marks: Partial<Marks>, recipient: RecipientRef = person) =>
    entry('e', { recipient, marks: { ...UNMARKED, ...marks } })

  it('reminds a person of what it has not seen and an agent of what is not resolved', () => {
    expect(remindable(marked({}))).toBe(true)
    expect(remindable(marked({ seenAt: at(1) }))).toBe(false)
    expect(remindable(marked({ seenAt: at(1) }, agent('a')))).toBe(true)
  })

  it.each([
    ['done', { resolved: { how: 'done', at: at(1) } }],
    ['dismissed', { resolved: { how: 'dismissed', at: at(1) } }],
    ['superseded', { supersededBy: identity('newer') }],
  ] as const)('never reminds of a %s notification', (_case, marks) => {
    expect(remindable(marked(marks))).toBe(false)
    expect(remindable(marked(marks, agent('a')))).toBe(false)
  })
})

describe('planBeat', () => {
  const slot = { index: 7, start: at(30) }
  const box = [entry('e1', { level: 'weak' }), entry('e2', { level: 'strong', sequence: 2 })]

  it('carries everything remindable, strong and weak, new and old', () => {
    expect(planBeat(slot, facts(), box, 0)).toEqual({ kind: 'form', members: box, standingOpen: 0 })
  })

  it('leaves out what is not remindable and what arrived after the slot started', () => {
    const late = entry('late', { acceptedAt: at(31) })
    const onTime = entry('on-time', { acceptedAt: at(30) })
    const seen = entry('seen', { marks: { ...UNMARKED, seenAt: at(1) } })
    expect(planBeat(slot, facts(), [late, onTime, seen], 0)).toEqual({
      kind: 'form',
      members: [onTime],
      standingOpen: 0,
    })
  })

  it.each([
    ['nothing is remindable and no standing item is open', facts(), [], 0],
    ['nothing is remindable and standing items could not be read', facts(), [], null],
    ['only late arrivals are in the inbox', facts(), [entry('late', { acceptedAt: at(31) })], 0],
    ['the destination takes strong units only', facts({ minLevel: 'strong' }), box, 3],
    ['the destination is disabled', facts({ enabled: false }), box, 3],
    ['the channel is absent', facts({ channelPresent: false }), box, 3],
  ])('forms nothing when %s', (_case, destination, entries, open) => {
    expect(planBeat(slot, destination, entries, open)).toEqual(nothing)
  })

  it('forms for open standing items alone, and says so when they could not be read', () => {
    expect(planBeat(slot, facts(), [], 2)).toEqual({ kind: 'form', members: [], standingOpen: 2 })
    expect(planBeat(slot, facts(), box, null)).toEqual({
      kind: 'form',
      members: box,
      standingOpen: null,
    })
  })

  it('is not held back by the minimum interval of strong units', () => {
    expect(planBeat(slot, facts({ lastStrongAt: at(29) }), box, 0).kind).toBe('form')
  })
})

describe('composeBody', () => {
  it('gives one strong notification in full', () => {
    const only = entry('e1', { external: true, cause: { kind: 'named' } })
    expect(composeBody('strong', [only], 3, null)).toEqual({
      kind: 'single',
      entry: {
        identity: identity('e1'),
        source,
        type: typeName,
        title: 'Title e1',
        body: 'Body of e1',
        locator: { kind: 'thing', ref: 'e1' },
        cause: { kind: 'named' },
        external: true,
      },
    })
  })

  it('gives a digest of the earliest few for several, with the full count', () => {
    const members = [3, 1, 4, 2].map(n => entry(`e${n}`, { sequence: n }))
    expect(composeBody('strong', members, 2, null)).toEqual({
      kind: 'digest',
      count: 4,
      listed: [1, 2].map(n => ({
        identity: identity(`e${n}`),
        source,
        type: typeName,
        title: `Title e${n}`,
      })),
      standingOpen: null,
    })
  })

  it('gives an empty digest for no members, strong or not', () => {
    const empty = { kind: 'digest', count: 0, listed: [], standingOpen: null }
    expect(composeBody('strong', [], 3, null)).toEqual(empty)
  })

  it('gives a digest for a beat even with one member, and for none', () => {
    expect(composeBody('beat', [entry('e1')], 3, 2)).toMatchObject({
      kind: 'digest',
      count: 1,
      standingOpen: 2,
    })
    expect(composeBody('beat', [], 3, 2)).toEqual({
      kind: 'digest',
      count: 0,
      listed: [],
      standingOpen: 2,
    })
  })
})

describe('planRetry', () => {
  const policy: RetryPolicy = { maxAttempts: 3, backoffMs: [60_000, 120_000] }
  const retryable = { kind: 'failed', reason: 'busy', retryable: true } as const
  const final = { kind: 'failed', reason: 'gone', retryable: false } as const
  const unknown = { kind: 'unknown' } as const

  it('is settled by a delivery, whatever the count', () => {
    for (const attempts of [1, 3, 9])
      expect(planRetry(attempts, { kind: 'delivered' }, policy, at(0))).toEqual({ kind: 'settled' })
  })

  it('stops at once when the channel says it can never deliver', () => {
    expect(planRetry(1, final, policy, at(0))).toEqual({ kind: 'stop' })
  })

  it.each([
    ['a retryable failure', retryable],
    ['an unknown result', unknown],
  ])('retries %s with the backoff of that attempt, then stops at the limit', (_case, last) => {
    expect(planRetry(1, last, policy, at(0))).toEqual({ kind: 'retry', at: at(1) })
    expect(planRetry(2, last, policy, at(0))).toEqual({ kind: 'retry', at: at(2) })
    expect(planRetry(3, last, policy, at(0))).toEqual({ kind: 'stop' })
    expect(planRetry(4, last, policy, at(0))).toEqual({ kind: 'stop' })
  })

  it('keeps the last backoff when there are more attempts than steps', () => {
    const long = { maxAttempts: 9, backoffMs: [60_000, 120_000] }
    expect(planRetry(5, unknown, long, at(0))).toEqual({ kind: 'retry', at: at(2) })
  })

  it('retries at once when no backoff is configured', () => {
    expect(planRetry(1, unknown, { maxAttempts: 2, backoffMs: [] }, at(4))).toEqual({
      kind: 'retry',
      at: at(4),
    })
  })
})

describe('redact', () => {
  const single = composeBody('strong', [entry('e1')], 3, null)
  const digest = composeBody('beat', [entry('e1')], 3, 0)

  it('keeps title and locator and cuts the text to what may be disclosed', () => {
    expect(redact(single, { kind: 'full' })).toBe(single)
    expect(redact(single, { kind: 'excerpt', length: 4 })).toMatchObject({
      entry: { title: 'Title e1', body: 'Body', locator: { kind: 'thing', ref: 'e1' } },
    })
    expect(redact(single, { kind: 'title-only' })).toMatchObject({
      entry: { title: 'Title e1', body: '', locator: { kind: 'thing', ref: 'e1' } },
    })
  })

  it('leaves a digest as it is: it carries no text', () => {
    expect(redact(digest, { kind: 'title-only' })).toBe(digest)
  })
})

describe('unitId', () => {
  it('differs by recipient, destination, kind and key, and is stable', () => {
    const base = { recipient: agent('a'), id: 'd1' }
    const ids = [
      unitId(base, 'strong', 1),
      unitId(base, 'strong', 2),
      unitId(base, 'beat', 1),
      unitId({ ...base, id: 'd2' }, 'strong', 1),
      unitId({ ...base, recipient: agent('b') }, 'strong', 1),
      unitId({ ...base, recipient: person }, 'strong', 1),
    ]
    expect(new Set(ids).size).toBe(ids.length)
    expect(unitId(base, 'strong', 1)).toBe(ids[0])
  })
})
