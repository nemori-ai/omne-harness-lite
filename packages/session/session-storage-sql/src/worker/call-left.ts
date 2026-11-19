// The calls that left the work snapshot: one row when a call leaves, one row for each slot written later.
import {
  callKeysIn,
  callWithLate,
  lendCalls,
  type SessionCall,
  type SessionCallKeys,
  type SessionLateCallFact,
  type SettledCallLookup,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import { packText } from '@omne-harness/sql-contract/worker'
import { canonicalText, decodeValue, encodeValue, sha256 } from '../codec.ts'
import { oneRow, packed, rowsOf, text, type Executor, type Scope } from './support.ts'

export const CALL_LEFT_MIGRATION = { owner: 'session', id: '012-call-left' } as const
export const CALL_LEFT_TABLES = ['sl_call_left', 'sl_call_late'] as const
export const CALL_LEFT_INDICES = ['sl_call_left_producer_idx', 'sl_call_late_producer_idx'] as const
export const CALL_LEFT_STATEMENTS: readonly string[] = [
  `CREATE TABLE sl_call_left (
    tenant TEXT NOT NULL, session TEXT NOT NULL, consumption TEXT NOT NULL, producer TEXT,
    position INTEGER NOT NULL, body BLOB NOT NULL,
    PRIMARY KEY (tenant, session, consumption)) STRICT, WITHOUT ROWID`,
  `CREATE INDEX sl_call_left_producer_idx ON sl_call_left (tenant, session, producer)
    WHERE producer IS NOT NULL`,
  `CREATE TABLE sl_call_late (
    tenant TEXT NOT NULL, session TEXT NOT NULL, consumption TEXT NOT NULL, slot TEXT NOT NULL,
    producer TEXT, position INTEGER NOT NULL, ordinal INTEGER NOT NULL, body BLOB NOT NULL,
    PRIMARY KEY (tenant, session, consumption, slot)) STRICT, WITHOUT ROWID`,
  `CREATE INDEX sl_call_late_producer_idx ON sl_call_late (tenant, session, producer)
    WHERE producer IS NOT NULL`,
]

const LATE_ROWS = 10_000

type Producer = SessionCallKeys['producers'][number]
const named = (producer: Producer): string =>
  sha256(canonicalText({ kind: producer.kind, call: producer.call }))
const producerOf = (record: SessionCall['record']): string | null =>
  record.registration.kind === 'associated' ? named(record.registration.binding.producer) : null
const body = (value: unknown): Uint8Array => packText(JSON.stringify(encodeValue(value)))
const read = <T>(cell: unknown): T => decodeValue(JSON.parse(packed(cell as never))) as T
const slotOf = (fact: SessionLateCallFact): string =>
  fact.slot === 'association' ? fact.slot : `${fact.slot}/${fact.version}`

export type CallsLeft = Readonly<{
  settled: readonly SessionCall[]
  late: readonly SessionLateCallFact[]
}>

/** `position` is the revision of the batch that let the calls leave or wrote the slots. */
export function writeCallsLeft(
  port: Executor,
  scope: Scope,
  position: bigint,
  left: CallsLeft,
): void {
  const key = [scope.tenant, scope.session] as const
  for (const call of left.settled)
    port.execute(
      'INSERT INTO sl_call_left (tenant, session, consumption, producer, position, body) VALUES (?, ?, ?, ?, ?, ?)',
      [...key, call.record.consumption, producerOf(call.record), position, body(call)],
    )
  for (const [ordinal, fact] of left.late.entries())
    port.execute(
      'INSERT INTO sl_call_late (tenant, session, consumption, slot, producer, position, ordinal, body) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        ...key,
        fact.consumption,
        slotOf(fact),
        fact.slot === 'association' ? producerOf(fact.record) : null,
        position,
        BigInt(ordinal),
        body(fact),
      ],
    )
}

function consumptionsOf(
  port: Executor,
  scope: Scope,
  keys: SessionCallKeys,
  through: bigint | null,
): ReadonlySet<string> {
  const ids = new Set<string>(keys.consumptions)
  const bound = through === null ? '' : ' AND position <= ?'
  for (const producer of keys.producers)
    for (const table of CALL_LEFT_TABLES) {
      const where = [scope.tenant, scope.session, named(producer)]
      const row = oneRow(
        port,
        `SELECT consumption FROM ${table} WHERE tenant = ? AND session = ? AND producer = ?${bound} LIMIT 1`,
        through === null ? where : [...where, through],
      )
      if (row !== undefined) ids.add(text(row['consumption']))
    }
  return ids
}

/** The calls that left, as of the batch at `through` when given: a row written later is not seen. */
export function callsLeft(
  port: Executor,
  scope: Scope,
  through: bigint | null = null,
): SettledCallLookup {
  const bound = through === null ? '' : ' AND position <= ?'
  return keys =>
    [...consumptionsOf(port, scope, keys, through)].flatMap(consumption => {
      const where = [scope.tenant, scope.session, consumption]
      const params = through === null ? where : [...where, through]
      const left = oneRow(
        port,
        `SELECT body FROM sl_call_left WHERE tenant = ? AND session = ? AND consumption = ?${bound} LIMIT 1`,
        params,
      )
      if (left === undefined) return []
      const late = rowsOf(
        port,
        `SELECT body FROM sl_call_late WHERE tenant = ? AND session = ? AND consumption = ?${bound}
          ORDER BY position, ordinal LIMIT ${LATE_ROWS + 1}`,
        params,
      )
      if (late.length > LATE_ROWS)
        throw new Error('the late facts of one call exceed the read bound')
      return [
        callWithLate(
          read<SessionCall>(left['body']),
          late.map(row => read<SessionLateCallFact>(row['body'])),
        ),
      ]
    })
}

/** The snapshot with the calls that `named` names and that left it, for one decision. */
export function lentTo<T extends WorkSnapshot | null>(
  port: Executor,
  scope: Scope,
  snapshot: T,
  named: unknown,
): T {
  if (snapshot === null) return snapshot
  return lendCalls(snapshot, callsLeft(port, scope)(callKeysIn(named))) as T
}
