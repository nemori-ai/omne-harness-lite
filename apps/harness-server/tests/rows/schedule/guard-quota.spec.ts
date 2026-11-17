import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import type { ParticipantPort, SqlCell } from '@omne-harness/sql-contract/worker'
import type { ScheduleManagementGuardRequirement } from '@omne-harness/schedule-local'
import { SCHEDULE_QUOTA_TABLE } from '../../../src/rows/schedule/guard.ts'
import migration from '../../../src/rows/schedule/guard-migration.ts'
import { holdQuota } from '../../../src/rows/schedule/guard-participant.ts'

type Requirement = Pick<ScheduleManagementGuardRequirement, 'quotaEffect' | 'resultingHolding'>
const owner = { kind: 'tenant', tenantId: 'tenant/o/a', ownerId: 'acc-a' } as never
const author = { kind: 'human', actorRef: 'acc-a' } as never
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}` as never

function port() {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  const execute: ParticipantPort['execute'] = (sql, params) => {
    const statement = db.prepare(sql)
    statement.setReadBigInts(true)
    if (!/^\s*SELECT/i.test(sql)) {
      const run = statement.run(...(params as never[]))
      return { columns: [], rows: [], changes: BigInt(run.changes), lastInsertRowid: null }
    }
    statement.setReturnArrays(true)
    const rows = statement.all(...(params as never[])) as unknown as SqlCell[][]
    return { columns: [], rows, changes: 0n, lastInsertRowid: null }
  }
  migration.up({ execute })
  const held = () =>
    execute(`SELECT schedule_id, held FROM ${SCHEDULE_QUOTA_TABLE} ORDER BY schedule_id`, []).rows
  return { execute, held }
}

const reserve = (n: number): Requirement => ({
  quotaEffect: { kind: 'reserve', owner, author, scheduleId: id(n) },
  resultingHolding: { kind: 'held', reservationRef: `reservation:${String(n)}` },
})
const release = (n: number, reservation = `reservation:${String(n)}`): Requirement => ({
  quotaEffect: { kind: 'release', reservationRef: reservation, scheduleId: id(n) },
  resultingHolding: { kind: 'released', releaseRef: `release:${String(n)}` },
})
const transfer = (from: number, to: number): Requirement => ({
  quotaEffect: {
    kind: 'transfer',
    reservationRef: `reservation:${String(from)}`,
    predecessorId: id(from),
    successorId: id(to),
    owner,
    author,
  },
  resultingHolding: { kind: 'held', reservationRef: `reservation:${String(to)}` },
})

describe('the quota the schedule guard keeps in the same transaction as the schedule', () => {
  it('lets a change without a quota effect through without touching the table', () => {
    const p = port()
    expect(holdQuota(p, { quotaEffect: { kind: 'none' }, resultingHolding: null }, 1)).toBeNull()
    expect(p.held()).toEqual([])
  })

  it('reserves one slot per schedule and refuses the one past capacity', () => {
    const p = port()
    expect(holdQuota(p, reserve(1), 2)).toBeNull()
    expect(holdQuota(p, reserve(2), 2)).toBeNull()
    expect(holdQuota(p, reserve(3), 2)).toBe('capacity_exceeded')
    expect(p.held()).toEqual([
      [id(1), 1n],
      [id(2), 1n],
    ])
  })

  it('frees the slot of a released schedule so a new one fits', () => {
    const p = port()
    holdQuota(p, reserve(1), 1)
    expect(holdQuota(p, release(1), 1)).toBeNull()
    expect(holdQuota(p, reserve(2), 1)).toBeNull()
  })

  it('moves the slot to the successor of a replaced schedule at full capacity', () => {
    const p = port()
    holdQuota(p, reserve(1), 1)
    expect(holdQuota(p, transfer(1, 2), 1)).toBeNull()
    expect(p.held()).toEqual([
      [id(1), 0n],
      [id(2), 1n],
    ])
  })

  it.each([
    [
      'a release of a slot that is not held',
      (p: ReturnType<typeof port>) => holdQuota(p, release(9), 5),
    ],
    [
      'a release naming another reservation',
      (p: ReturnType<typeof port>) => (
        holdQuota(p, reserve(1), 5),
        holdQuota(p, release(1, 'reservation:x'), 5)
      ),
    ],
    [
      'a release of a slot already released',
      (p: ReturnType<typeof port>) => (
        holdQuota(p, reserve(1), 5),
        holdQuota(p, release(1), 5),
        holdQuota(p, release(1), 5)
      ),
    ],
    [
      'a release whose result is not released',
      (p: ReturnType<typeof port>) => (
        holdQuota(p, reserve(1), 5),
        holdQuota(p, { ...release(1), resultingHolding: null }, 5)
      ),
    ],
    [
      'a reservation whose result is not held',
      (p: ReturnType<typeof port>) => holdQuota(p, { ...reserve(1), resultingHolding: null }, 5),
    ],
    [
      'a transfer from a slot that is not held',
      (p: ReturnType<typeof port>) => holdQuota(p, transfer(1, 2), 5),
    ],
  ])('answers stale basis for %s', (_, act) => {
    expect(act(port())).toBe('stale_basis')
  })
})
