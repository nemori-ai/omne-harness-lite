import type { JsonValue } from '@omne-harness/sql-contract'
import { unpackText } from '@omne-harness/sql-contract/worker'
import { describe, expect, it } from 'vitest'
import participant from '../src/worker/participant.ts'
import { migratedPort } from './fixtures/sqlite-storage.ts'

describe('facts of another protocol', () => {
  it('are unsupported and write nothing', () => {
    const { port, rows } = migratedPort()
    expect(participant.execute({ intent: 'ledger', tenant: 'tenant-a' }, port)).toEqual({
      kind: 'unsupported',
      basis: { reason: 'facts' },
    })
    expect(rows('SELECT COUNT(*) AS n FROM tl_domain')).toEqual([{ n: 0n }])
  })
})

describe('the fixed part of a record', () => {
  const ledger = (expected: string, revision: string, writes: readonly JsonValue[]) => ({
    intent: 'ledger',
    tenant: 'tenant-a',
    kind: 'call',
    name: 'call-1',
    expected,
    revision,
    writes,
    asserts: [],
  })
  const put = (record: JsonValue, fixed?: JsonValue): JsonValue => ({
    op: 'put',
    key: 'call',
    record,
    ...(fixed === undefined ? {} : { fixed }),
  })
  const committed = { kind: 'participated', response: { kind: 'committed' } }

  it('is written when the command gives it and stays when a later put keeps it', () => {
    const { port, rows } = migratedPort()
    const given = { kind: 'given', value: { text: 'request' } }
    expect(participant.execute(ledger('0', '1', [put({ step: 1 }, given)]), port)).toEqual(
      committed,
    )
    expect(
      participant.execute(ledger('1', '2', [put({ step: 2 }, { kind: 'kept' })]), port),
    ).toEqual(committed)
    const stored = rows('SELECT record, fixed FROM tl_record')
    expect(stored).toHaveLength(1)
    const json = (cell: unknown): unknown => {
      if (!(cell instanceof Uint8Array)) throw new Error('a BLOB cell was expected')
      return JSON.parse(unpackText(cell))
    }
    expect(json(stored[0]?.['record'])).toEqual({ step: 2 })
    expect(json(stored[0]?.['fixed'])).toEqual({ text: 'request' })
  })

  it('stops a put that keeps a fixed part the store does not hold', () => {
    const { port, rows } = migratedPort()
    expect(
      participant.execute(ledger('0', '1', [put({ step: 1 }, { kind: 'kept' })]), port),
    ).toEqual({ kind: 'conflict', basis: { reason: 'fixed-missing' } })
    expect(participant.execute(ledger('0', '1', [put({ step: 1 })]), port)).toEqual(committed)
    expect(
      participant.execute(ledger('1', '2', [put({ step: 2 }, { kind: 'kept' })]), port),
    ).toEqual({ kind: 'conflict', basis: { reason: 'fixed-missing' } })
    expect(rows('SELECT COUNT(*) AS n FROM tl_record WHERE fixed IS NOT NULL')).toEqual([{ n: 0n }])
  })

  it('refuses a fixed part that is neither given nor kept', () => {
    const { port } = migratedPort()
    expect(
      participant.execute(ledger('0', '1', [put({ step: 1 }, { kind: 'other' })]), port),
    ).toEqual({ kind: 'unsupported', basis: { reason: 'facts' } })
  })
})
