import type { ResidentTool, WorkSnapshot } from '@omne-harness/session-contract'
import type { ParticipantPort } from '@omne-harness/sql-contract/worker'
import { canonicalText, encodeValue, sha256 } from '../codec.ts'

type ResidentRow = Readonly<{ key: string; capability: string; shape: ResidentTool['shape'] }>

const shapeText = (row: ResidentRow): string => JSON.stringify(encodeValue(row.shape))
const shapeDigest = (row: ResidentRow): string => sha256(canonicalText(encodeValue(row.shape)))
const sameShape = (one: ResidentRow, other: ResidentRow): boolean =>
  one.shape === other.shape || shapeDigest(one) === shapeDigest(other)

function residentRows(snapshot: WorkSnapshot | null): ReadonlyMap<string, ResidentRow> {
  const rows = new Map<string, ResidentRow>()
  if (snapshot === null || snapshot.lifecycle === 'archived') return rows
  for (const pair of snapshot.residentKeys ?? []) {
    const resident = snapshot.residents.find(item => item.capability === pair.capability)
    if (resident !== undefined)
      rows.set(JSON.stringify([pair.key, pair.capability]), {
        key: pair.key,
        capability: pair.capability,
        shape: resident.shape,
      })
  }
  return rows
}

export function maintainResidents(
  port: ParticipantPort,
  tenant: string,
  session: string,
  previous: WorkSnapshot | null,
  snapshot: WorkSnapshot,
): void {
  const indexed = residentRows(previous)
  const residents = residentRows(snapshot)
  const released: ResidentRow[] = []
  for (const [id, row] of indexed)
    if (!residents.has(id)) {
      port.execute(
        'DELETE FROM sl_resident_idx WHERE resident_key = ? AND tenant = ? AND session = ? AND capability = ?',
        [row.key, tenant, session, row.capability],
      )
      released.push(row)
    }
  for (const [id, row] of residents) {
    const old = indexed.get(id)
    if (old !== undefined && sameShape(old, row)) continue
    const digest = shapeDigest(row)
    port.execute(
      'INSERT OR IGNORE INTO sl_resident_shape (tenant, digest, shape) VALUES (?, ?, ?)',
      [tenant, digest, shapeText(row)],
    )
    port.execute(
      'INSERT OR REPLACE INTO sl_resident_idx (resident_key, tenant, session, capability, shape_digest) VALUES (?, ?, ?, ?, ?)',
      [row.key, tenant, session, row.capability, digest],
    )
    if (old !== undefined) released.push(old)
  }
  if (released.length === 0) return
  const held = new Set([...residents.values()].map(shapeDigest))
  for (const digest of new Set(released.map(shapeDigest)))
    if (!held.has(digest))
      port.execute(
        'DELETE FROM sl_resident_shape WHERE tenant = ? AND digest = ? AND NOT EXISTS (SELECT 1 FROM sl_resident_idx WHERE tenant = ? AND shape_digest = ?)',
        [tenant, digest, tenant, digest],
      )
}
