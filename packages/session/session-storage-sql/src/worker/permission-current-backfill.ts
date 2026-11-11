import {
  rebuildSessionPermissions,
  type CommittedBatch,
  type HistoryEntry,
  type SessionPermissionHistory,
} from '@omne-harness/session-contract'
import { z } from 'zod'
import { canonicalText, encodeValue } from '../codec.ts'
import { readEntryText } from '../entry-codec.ts'
import { readState, writeState } from './state-rows.ts'
import { readPermissionCurrent } from './permission-current.ts'
import { big, oneRow, rowsOf, text, type Executor, type Scope } from './support.ts'

const receiptSchema = z.object({
  first: z.string().regex(/^\d+$/),
  last: z.string().regex(/^\d+$/),
  revision: z.string().regex(/^\d+$/),
})
const json = (value: unknown) => JSON.stringify(encodeValue(value))
const PAGE = 200

function originalBatch(port: Executor, scope: Scope, revision: string): CommittedBatch {
  const records = rowsOf(
    port,
    'SELECT receipt FROM sl_operation WHERE tenant = ? AND session = ? AND revision = ? LIMIT 2',
    [scope.tenant, scope.session, BigInt(revision)],
  )
  if (records.length !== 1)
    throw new Error('permission migration cannot identify the original batch receipt')
  const receipt = receiptSchema.parse(JSON.parse(text(records[0]!['receipt'])))
  if (receipt.revision !== revision || BigInt(receipt.first) > BigInt(receipt.last))
    throw new Error('permission migration batch receipt is inconsistent')
  const entries: HistoryEntry[] = []
  let position = BigInt(receipt.first)
  const last = BigInt(receipt.last)
  while (position <= last) {
    const rows = rowsOf(
      port,
      'SELECT position, entry FROM sl_entry WHERE tenant = ? AND session = ? AND position >= ? AND position <= ? ORDER BY position LIMIT 200',
      [scope.tenant, scope.session, position, last],
    )
    if (rows.length === 0) throw new Error('permission migration batch is incomplete')
    for (const row of rows) {
      const entry = readEntryText(text(row['entry']))
      if (
        big(row['position']) !== position ||
        BigInt(entry.id) !== position ||
        entry.revision !== revision
      )
        throw new Error('permission migration batch has a gap or contradictory position')
      entries.push(entry)
      position += 1n
    }
  }
  return { revision: revision as CommittedBatch['revision'], entries }
}

function* permissionBatches(port: Executor, scope: Scope): Iterable<CommittedBatch> {
  let after = 0n
  let previous: string | null = null
  for (;;) {
    const rows = rowsOf(
      port,
      `SELECT position, revision FROM sl_entry WHERE tenant = ? AND session = ?
      AND kind IN ('session.created', 'session.mode-changed', 'session.permission-assigned') AND position > ?
      ORDER BY position LIMIT 200`,
      [scope.tenant, scope.session, after],
    )
    for (const row of rows) {
      after = big(row['position'])
      const revision = String(big(row['revision']))
      if (revision !== previous) {
        yield originalBatch(port, scope, revision)
        previous = revision
      }
    }
    if (rows.length < PAGE) return
  }
}

function checkExisting(port: Executor, scope: Scope, value: SessionPermissionHistory): void {
  const { permissions, mode, source } = value
  const count = oneRow(
    port,
    'SELECT COUNT(*) AS count FROM sl_permission_assignment WHERE tenant = ? AND session = ? LIMIT 1',
    [scope.tenant, scope.session],
  )
  if (big(count?.['count']) !== BigInt(permissions.assignments.length))
    throw new Error('permission migration found contradictory assignments')
  const assignments = permissions.assignments.length === 0 ? [null] : permissions.assignments
  for (const item of assignments) {
    const key = {
      capabilityId: item?.capabilityId ?? 'migration-empty',
      enforcementKey: item?.enforcementKey ?? 'migration-empty',
    }
    const current = readPermissionCurrent(port, { ...scope, ...key })
    const expected = {
      kind: 'current',
      ...scope,
      ...key,
      revision: permissions.revision,
      mode,
      source,
      assignment: item,
    }
    if (canonicalText(current) !== canonicalText(expected))
      throw new Error('permission migration found contradictory current values')
  }
}

function insertProjection(port: Executor, scope: Scope, value: SessionPermissionHistory): void {
  const { permissions, mode, source } = value
  port.execute(
    'INSERT INTO sl_permission_head (tenant, session, revision, adopted, override, source) VALUES (?, ?, ?, ?, ?, ?)',
    [
      scope.tenant,
      scope.session,
      BigInt(permissions.revision),
      json(mode.adopted),
      mode.override === null ? null : json(mode.override),
      json(source),
    ],
  )
  for (const item of permissions.assignments)
    port.execute(
      'INSERT INTO sl_permission_assignment (tenant, session, capability, enforcement, definition, rule, source) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        scope.tenant,
        scope.session,
        item.capabilityId,
        item.enforcementKey,
        json(item.definition),
        json(item.rule),
        json(item.source),
      ],
    )
}

function backfillSession(port: Executor, scope: Scope, tail: bigint): void {
  const stored = readState(port, scope.tenant, scope.session, tail)
  if (stored === 'behind')
    throw new Error('permission migration requires a covering Session snapshot')
  const result = rebuildSessionPermissions(stored.snapshot, permissionBatches(port, scope))
  if (result.kind !== 'rebuilt') throw new Error(result.diagnostic)
  const existing = oneRow(
    port,
    'SELECT revision FROM sl_permission_head WHERE tenant = ? AND session = ? LIMIT 1',
    [scope.tenant, scope.session],
  )
  if (existing === undefined) insertProjection(port, scope, result.value)
  else checkExisting(port, scope, result.value)
  if (canonicalText(encodeValue(stored.snapshot)) !== canonicalText(encodeValue(result.snapshot)))
    writeState(port, { ...scope, covered: tail }, stored.snapshot, result.snapshot)
}

export function backfillPermissionCurrent(port: Executor): void {
  let tenant = ''
  let session = ''
  for (;;) {
    const rows = rowsOf(
      port,
      'SELECT tenant, session, tail FROM sl_journal WHERE (tenant, session) > (?, ?) ORDER BY tenant, session LIMIT 200',
      [tenant, session],
    )
    for (const row of rows) {
      tenant = text(row['tenant'])
      session = text(row['session'])
      backfillSession(port, { tenant, session }, big(row['tail']))
    }
    if (rows.length < PAGE) return
  }
}
