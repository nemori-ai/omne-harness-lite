import { describe, expect, it } from 'vitest'
import { fakeClock } from '@omne-harness/notification/testing'
import { tenantIdSchema, type Destination, type Instant } from '@omne-harness/notification-contract'
import type { NotificationStore } from '@omne-harness/notification'
import { createWakeUps } from '../src/hints.ts'
import { createChanges, inAppChannel, observed } from '../src/changes.ts'
import { blockedItems } from '../src/sources.ts'
import { select } from '../src/storage/facts.ts'
import participant from '../src/storage/participant.ts'
import reader from '../src/storage/read.ts'
import { ROW_LIMIT } from '../src/storage/schema.ts'
import { manualTimers } from './fixture.ts'

const t1 = tenantIdSchema.parse('t1')
const t2 = tenantIdSchema.parse('t2')
const at = (minute: number) => new Date(Date.UTC(2026, 10, 18, 6, minute)).toISOString() as Instant

describe('wake-ups', () => {
  function wakeUps() {
    const manual = manualTimers()
    const woken: string[] = []
    const clock = fakeClock('2026-11-18T06:00:00.000Z')
    return {
      manual,
      woken,
      clock,
      hints: createWakeUps(clock, manual.timers, tenant => void woken.push(tenant)),
    }
  }

  it('keep one timer per tenant, for the earliest instant', () => {
    const { manual, woken, hints } = wakeUps()
    hints.wakeAt(t1, at(10))
    hints.wakeAt(t1, at(20))
    hints.wakeAt(t1, at(5))
    hints.wakeAt(t2, at(7))
    expect([...manual.pending.values()].map(timer => timer.delayMs).sort((a, b) => a - b)).toEqual([
      5 * 60_000,
      7 * 60_000,
    ])
    manual.fire(5 * 60_000)
    expect(woken).toEqual([t1])
    hints.wakeAt(t1, at(20))
    expect(manual.pending.size).toBe(2)
  })

  it('wake at once for an instant that has passed', () => {
    const { manual, clock, hints } = wakeUps()
    clock.set('2026-11-18T07:00:00.000Z')
    hints.wakeAt(t1, at(10))
    expect([...manual.pending.values()].map(timer => timer.delayMs)).toEqual([0])
  })

  it('clear every timer when they stop, and take no more', () => {
    const { manual, woken, hints } = wakeUps()
    hints.wakeAt(t1, at(10))
    hints.stop()
    hints.wakeAt(t2, at(10))
    expect(manual.pending.size).toBe(0)
    expect(woken).toEqual([])
  })
})

const hearing = (seen: unknown[]) => ({
  changed: (change: unknown) => void seen.push(change),
  closed: () => void seen.push('closed'),
})

describe('changes', () => {
  it('reach every observer, and one that throws is reported without stopping the others', () => {
    const reported: unknown[] = []
    const changes = createChanges(error => void reported.push(error))
    const seen: unknown[] = []
    const failing = new Error('observer failed')
    const thrower = () => {
      throw failing
    }
    changes.subscribe({ changed: thrower, closed: thrower })
    const undo = changes.subscribe(hearing(seen))
    changes.emit({ kind: 'catalog' })
    undo()
    changes.emit({ kind: 'catalog' })
    expect(seen).toEqual([{ kind: 'catalog' }])
    changes.close()
    expect(reported).toEqual([failing, failing, failing])
  })

  it('once closed tell every observer so, once, and carry nothing more', () => {
    const changes = createChanges(() => {})
    const seen: unknown[] = []
    const gone: unknown[] = []
    changes.subscribe(hearing(seen))
    changes.subscribe(hearing(gone))()
    changes.close()
    changes.close()
    changes.emit({ kind: 'catalog' })
    expect(seen).toEqual(['closed'])
    expect(gone).toEqual([])
    const late: unknown[] = []
    changes.subscribe(hearing(late))()
    changes.emit({ kind: 'catalog' })
    expect(late).toEqual(['closed'])
  })

  it('are told by the in-app channel, which accepts only the empty address', async () => {
    const changes = createChanges(() => {})
    const seen: unknown[] = []
    changes.subscribe(hearing(seen))
    const channel = inAppChannel(changes)
    expect(channel.address.accepts('')).toBe(true)
    expect(channel.address.accepts('x')).toBe(false)
    expect(channel.leavesSystem).toBe(false)
    const recipient = { kind: 'person' } as const
    const result = await channel.deliver({ tenant: t1, recipient, address: '', unit: {} as never })
    expect(result).toEqual({ kind: 'delivered' })
    expect(seen).toEqual([{ kind: 'inbox', tenant: t1, recipient }])
  })

  it('follow a commit that was written or may have been, never one that was rolled back, and never a delivery', async () => {
    const changes = createChanges(() => {})
    const seen: unknown[] = []
    changes.subscribe(hearing(seen))
    const answers = ['committed', 'unknown', 'rolled-back'] as const
    let turn = 0
    const answer = async () => {
      const kind = answers[turn++ % answers.length]
      return kind === 'committed' ? { kind, value: null } : { kind }
    }
    const names = [
      'accept',
      'mark',
      'subscribe',
      'setBeat',
      'destination',
      'formStrong',
      'recordDelivery',
    ]
    const store = observed(
      Object.fromEntries(names.map(name => [name, answer])) as never as NotificationStore,
      changes,
    )
    for (const name of ['accept', 'mark', 'subscribe', 'setBeat', 'destination'] as const)
      for (let call = 0; call < 3; call += 1) await store[name](t1, {} as never)
    expect(seen).toHaveLength(10)
    expect(new Set(seen.map(change => JSON.stringify(change)))).toEqual(
      new Set([JSON.stringify({ kind: 'inbox', tenant: t1, recipient: null })]),
    )
    await store.formStrong(t1, {} as never)
    await store.recordDelivery(t1, {} as never)
    expect(seen).toHaveLength(10)
  })
})

describe('blocked destinations as standing items', () => {
  const destination = (id: string, blockedSince: Instant | null): Destination => ({
    recipient: { kind: 'agent', ref: 's-1' },
    id,
    channel: 'session' as never,
    address: 's-1',
    minLevel: 'weak',
    enabled: true,
    builtin: id === 'default',
    lastStrongAt: null,
    strongCursor: 0,
    strongUnits: 0,
    blockedSince,
  })

  it('are one item per blocked destination, since when it is blocked, with an identity of its own', () => {
    const items = blockedItems([
      destination('default', at(3)),
      destination('ok', null),
      destination('other', at(9)),
    ])
    expect(items.map(item => [item.since, item.type, item.title])).toEqual([
      [at(3), 'delivery-blocked', '通知推不到「session」'],
      [at(9), 'delivery-blocked', '通知推不到「session」'],
    ])
    expect(new Set(items.map(item => item.id)).size).toBe(2)
    expect(items.every(item => item.subject !== null && item.id.endsWith(item.subject))).toBe(true)
  })
})

describe('a statement of the repository', () => {
  const port = (count: number) => ({
    execute: (sql: string) => ({
      columns: [],
      rows: Array.from({ length: count }, () => [sql]),
      changes: 0n,
      lastInsertRowid: null,
    }),
  })

  it('asks for one row more than it may return and fails instead of cutting the answer', () => {
    expect(select(port(ROW_LIMIT), 'SELECT x FROM t', [])).toHaveLength(ROW_LIMIT)
    expect(select(port(1), 'SELECT x FROM t', [])[0]?.[0]).toBe(
      `SELECT x FROM t LIMIT ${ROW_LIMIT + 1}`,
    )
    expect(() => select(port(ROW_LIMIT + 1), 'SELECT x FROM t', [])).toThrow(/more rows/)
  })
})

describe('what crosses into the storage worker', () => {
  const untouched = {
    execute() {
      throw new Error('the port was used')
    },
    requireFact() {
      throw new Error('a fact was asked for')
    },
    provideFact() {
      throw new Error('a fact was provided')
    },
  }

  it.each([
    ['no script', {}],
    ['a script that is not a string', { script: 7, command: {} }],
    ['a script it does not know', { script: 'drop', command: {} }],
    ['a property of Object as the script', { script: 'constructor', command: {} }],
  ])('is refused by the participant without touching the database: %s', (_case, facts) => {
    expect(participant.execute(facts as never, untouched)).toEqual({
      kind: 'failed',
      diagnostic: 'unknown_notification_script',
    })
  })

  it.each([
    ['no read', {}],
    ['a read it does not know', { read: 'everything', args: [] }],
    ['arguments that are not a list', { read: 'beat', args: 'person' }],
    ['a stray field', { read: 'beat', args: [], extra: 1 }],
  ])('is refused by the read handler without touching the database: %s', (_case, input) => {
    expect(reader.read(input as never, untouched)).toEqual({
      kind: 'failed',
      diagnostic: 'invalid_notification_read',
    })
  })
})
