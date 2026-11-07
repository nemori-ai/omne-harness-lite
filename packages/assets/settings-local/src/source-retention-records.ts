import { z } from 'zod'
import type { ParticipantPort, ReadPort } from '@omne-harness/sql-contract/worker'
import { canonical, digest, equal, withinBudget } from './encoding.ts'
import {
  sourcePageSchema,
  sourceReferenceSchema,
  sourceRequestSchema,
  sourceSettlementSchema,
  sourceSnapshotSchema,
  sourceUpdateSchema,
  type SourcePage,
  type SourceReference,
  type SourceRequest,
  type SourceSettlement,
  type SourceSnapshot,
  type SourceUpdate,
} from './source-retention-schema.ts'

const conflict = () => ({ kind: 'conflict' as const })
export const sourceKey = (source: SourceReference) => digest(source)
export const sourceReservationKey = (request: SourceRequest) =>
  digest([
    request.source,
    request.destination.ownerRef,
    request.destination.identity,
    request.destination.attemptId,
  ])
const updateKey = (update: SourceUpdate) => digest(update.identity)

const gateRow = z.tuple([z.string(), z.string().nullable(), z.string().nullable()])
function decodeGate(row: readonly unknown[], source: SourceReference) {
  const [storedSource, pendingKey, pendingJson] = gateRow.parse(row)
  if (!equal(JSON.parse(storedSource), source)) throw new Error('Invalid source gate binding')
  if (pendingKey === null && pendingJson === null) return { source, pending: null }
  const pending = sourceUpdateSchema.parse(JSON.parse(z.string().parse(pendingJson)))
  if (updateKey(pending) !== pendingKey || !equal(pending.source, source))
    throw new Error('Invalid pending source update')
  return { source, pending }
}
function readGate(port: ReadPort, source: SourceReference) {
  const row = port.execute(
    'SELECT source_json, pending_key, pending_json FROM st_source_gate WHERE source_key = ? LIMIT 1',
    [sourceKey(source)],
  ).rows[0]
  return row ? decodeGate(row, source) : null
}
function ensureGate(port: ParticipantPort, source: SourceReference) {
  const previous = readGate(port, source)
  if (previous) return previous
  port.execute(
    'INSERT INTO st_source_gate (source_key, source_json, pending_key, pending_json) VALUES (?, ?, NULL, NULL)',
    [sourceKey(source), canonical(source)],
  )
  return { source, pending: null }
}
const reservationRow = z.tuple([
  z.string(),
  z.string(),
  z.enum(['held', 'settled']),
  z.enum(['committed', 'aborted']).nullable(),
])
function decodeReservation(row: readonly unknown[], key: string) {
  const [requestJson, snapshotJson, state, outcome] = reservationRow.parse(row)
  const request = sourceRequestSchema.parse(JSON.parse(requestJson))
  if (sourceReservationKey(request) !== key) throw new Error('Invalid source reservation binding')
  const rawSnapshot: unknown = JSON.parse(snapshotJson)
  const snapshot = rawSnapshot === null ? null : sourceSnapshotSchema.parse(rawSnapshot)
  if (snapshot === null) {
    if (state !== 'settled' || outcome !== 'aborted')
      throw new Error('Only an aborted source reservation can lack a snapshot')
  } else if (!equal(request.source, snapshot.source))
    throw new Error('Invalid source reservation binding')
  if (state === 'held') {
    if (outcome !== null || snapshot === null) throw new Error('Invalid held source reservation')
    return { kind: 'held' as const, reservationId: key, request, snapshot }
  }
  return {
    kind: 'settled' as const,
    reservationId: key,
    request,
    outcome: z.enum(['committed', 'aborted']).parse(outcome),
  }
}
function readReservation(port: ReadPort, request: SourceRequest) {
  const key = sourceReservationKey(request)
  const row = port.execute(
    'SELECT request_json, snapshot_json, state, outcome, source_key FROM st_source_reservation WHERE reservation_key = ? LIMIT 1',
    [key],
  ).rows[0]
  if (!row) return { kind: 'not_found' as const }
  const record = decodeReservation(row.slice(0, 4), key)
  if (sourceKey(record.request.source) !== row[4]) throw new Error('Invalid reservation source key')
  return equal(record.request, request) ? record : conflict()
}
function heldCount(port: ReadPort, source: SourceReference) {
  const row = port.execute(
    "SELECT count(*) FROM st_source_reservation WHERE source_key = ? AND state = 'held' LIMIT 1",
    [sourceKey(source)],
  ).rows[0]
  return z.coerce.number().int().min(0).max(128).parse(row?.[0])
}
export function reserveSource(port: ParticipantPort, raw: SourceRequest, current: SourceSnapshot) {
  if (!withinBudget({ raw, current })) return { kind: 'limited' as const }
  const request = sourceRequestSchema.parse(raw)
  const previous = readReservation(port, request)
  if (previous.kind !== 'not_found') return previous
  const snapshot = sourceSnapshotSchema.parse(current)
  if (!equal(snapshot.source, request.source)) return conflict()
  const gate = ensureGate(port, request.source)
  if (gate.pending) return { kind: 'blocked' as const }
  if (heldCount(port, request.source) >= 128) return { kind: 'limited' as const }
  port.execute(
    `INSERT INTO st_source_reservation
    (reservation_key, source_key, request_json, snapshot_json, state, outcome)
    VALUES (?, ?, ?, ?, 'held', NULL)`,
    [
      sourceReservationKey(request),
      sourceKey(request.source),
      canonical(request),
      canonical(snapshot),
    ],
  )
  return readReservation(port, request)
}
export function settleSource(port: ParticipantPort, raw: SourceSettlement) {
  const input = sourceSettlementSchema.parse(raw)
  const previous = readReservation(port, input.request)
  if (previous.kind === 'conflict') return previous
  if (previous.kind === 'not_found') return abortUnreservedSource(port, input)
  if (previous.kind === 'settled') return previous.outcome === input.outcome ? previous : conflict()
  port.execute(
    "UPDATE st_source_reservation SET state = 'settled', outcome = ? WHERE reservation_key = ? AND state = 'held'",
    [input.outcome, previous.reservationId],
  )
  return readReservation(port, input.request)
}
function abortUnreservedSource(port: ParticipantPort, input: SourceSettlement) {
  if (input.outcome !== 'aborted') return conflict()
  ensureGate(port, input.request.source)
  port.execute(
    `INSERT INTO st_source_reservation
    (reservation_key, source_key, request_json, snapshot_json, state, outcome)
    VALUES (?, ?, ?, 'null', 'settled', 'aborted')`,
    [
      sourceReservationKey(input.request),
      sourceKey(input.request.source),
      canonical(input.request),
    ],
  )
  return readReservation(port, input.request)
}
export function beginSourceUpdate(port: ParticipantPort, raw: SourceUpdate) {
  const update = sourceUpdateSchema.parse(raw)
  const gate = ensureGate(port, update.source)
  if (gate.pending) {
    if (updateKey(gate.pending) !== updateKey(update)) return { kind: 'blocked' as const }
    return equal(gate.pending, update) ? { kind: 'pending' as const, update } : conflict()
  }
  port.execute(
    'UPDATE st_source_gate SET pending_key = ?, pending_json = ? WHERE source_key = ? AND pending_key IS NULL',
    [updateKey(update), canonical(update), sourceKey(update.source)],
  )
  return { kind: 'pending' as const, update }
}
export function sourceUpdateReadiness(port: ReadPort, raw: SourceUpdate) {
  const update = sourceUpdateSchema.parse(raw)
  const gate = readGate(port, update.source)
  if (!gate?.pending || !equal(gate.pending, update)) return conflict()
  const held = heldCount(port, update.source)
  return { kind: held === 0 ? ('ready' as const) : ('draining' as const), held, update }
}
/** The caller must persist the matching root terminal in this same transaction. */
export function finishSourceUpdate(
  port: ParticipantPort,
  raw: SourceUpdate,
  outcome: 'committed' | 'aborted',
) {
  const update = sourceUpdateSchema.parse(raw)
  z.enum(['committed', 'aborted']).parse(outcome)
  const current = sourceUpdateReadiness(port, update)
  if (current.kind === 'conflict') return current
  if (outcome === 'committed' && current.kind === 'draining') return { kind: 'blocked' as const }
  port.execute(
    'UPDATE st_source_gate SET pending_key = NULL, pending_json = NULL WHERE source_key = ? AND pending_key = ?',
    [sourceKey(update.source), updateKey(update)],
  )
  return { kind: 'finished' as const, update, outcome }
}
export function readSourceGate(port: ReadPort, raw: SourceReference) {
  const source = sourceReferenceSchema.parse(raw)
  const gate = readGate(port, source)
  return {
    kind: 'gate' as const,
    source,
    pending: gate?.pending ?? null,
    held: heldCount(port, source),
  }
}
export function readSourceReservation(port: ReadPort, raw: SourceRequest) {
  return readReservation(port, sourceRequestSchema.parse(raw))
}
function metadataPage<T>(
  rows: readonly (readonly unknown[])[],
  decode: (row: readonly unknown[]) => T,
) {
  const items: T[] = []
  let bytes = 0
  let after: string | null = null
  for (const row of rows) {
    const item = decode(row)
    const size = Buffer.byteLength(canonical(item))
    if (items.length > 0 && bytes + size > 1024 * 1024) break
    items.push(item)
    bytes += size
    after = z.string().parse(row[0])
  }
  return { items, after }
}
function reservationMetadata(row: readonly unknown[]) {
  const request = sourceRequestSchema.parse(JSON.parse(z.string().parse(row[1])))
  const reservationId = z.string().parse(row[0])
  if (sourceReservationKey(request) !== reservationId || sourceKey(request.source) !== row[2])
    throw new Error('Invalid source recovery reservation')
  return { reservationId, request }
}
export function recoverSourceHolds(port: ReadPort, raw: SourcePage) {
  const page = sourcePageSchema.parse(raw)
  const rows = port.execute(
    `SELECT reservation_key, request_json, source_key
      FROM st_source_reservation WHERE state = 'held' AND reservation_key > ?
      ORDER BY reservation_key LIMIT ?`,
    [page.after ?? '', page.limit],
  ).rows
  return metadataPage(rows, reservationMetadata)
}
export function recoverOneSourceHolds(port: ReadPort, raw: SourceReference, rawPage: SourcePage) {
  const source = sourceReferenceSchema.parse(raw)
  const page = sourcePageSchema.parse(rawPage)
  const rows = port.execute(
    `SELECT reservation_key, request_json, source_key
      FROM st_source_reservation WHERE source_key = ? AND state = 'held' AND reservation_key > ?
      ORDER BY reservation_key LIMIT ?`,
    [sourceKey(source), page.after ?? '', page.limit],
  ).rows
  return metadataPage(rows, row => {
    const item = reservationMetadata(row)
    if (!equal(item.request.source, source)) throw new Error('Invalid source recovery scope')
    return item
  })
}

export function recoverSourceUpdates(port: ReadPort, raw: SourcePage) {
  const page = sourcePageSchema.parse(raw)
  const rows = port.execute(
    `SELECT source_key, source_json, pending_key, pending_json
    FROM st_source_gate WHERE pending_key IS NOT NULL AND source_key > ?
    ORDER BY source_key LIMIT ?`,
    [page.after ?? '', page.limit],
  ).rows
  return metadataPage(rows, row => {
    const source = sourceReferenceSchema.parse(JSON.parse(z.string().parse(row[1])))
    if (sourceKey(source) !== row[0]) throw new Error('Invalid source recovery key')
    return decodeGate(row.slice(1), source)
  })
}
