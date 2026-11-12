import { z } from 'zod'
import type { ReadHandlerModule, ReadPort } from '@omne-harness/sql-contract/worker'
import type { ScheduleOwner } from '@omne-harness/schedule-contract'
import { canonical, equal, json, ownerMatches } from './encoding.ts'
import { bindingSchema, HANDLER, PROTOCOL, recordSchema, revisionSchema } from './schema.ts'
import { readRequestSchema, type PageRequest, type RepositoryRequest } from './read-schema.ts'
import { cursorKey, nextCursor, pageRelation, visibleRelation } from './pagination.ts'
import { readRecord } from './records.ts'
function observation(port: ReadPort, owner: ScheduleOwner): string {
  const row = port.execute('SELECT revision FROM sc_observations WHERE owner = ? LIMIT 1', [
    canonical(owner),
  ]).rows[0]
  if (row === undefined) return '0'
  const value = row[0]
  if (typeof value !== 'bigint' || value < 0n) throw new Error('Invalid observation revision')
  return value.toString()
}
function get(input: Extract<RepositoryRequest, { kind: 'get' }>, port: ReadPort) {
  const relation = visibleRelation(input.access)
  const row = port.execute(
    `SELECT record FROM sc_schedules WHERE ${relation.sql} AND schedule_id = ? LIMIT 1`,
    [...relation.params, input.scheduleId],
  ).rows[0]
  if (row === undefined) return { kind: 'absent' }
  const record = recordSchema.parse(JSON.parse(z.string().parse(row[0])))
  if (!equal(record.view.owner, input.access.owner) || record.view.scheduleId !== input.scheduleId)
    throw new Error('Stored schedule binding mismatch')
  return {
    kind: 'ok',
    value: { observationRevision: observation(port, input.access.owner), value: record },
  }
}
function page(input: PageRequest, port: ReadPort) {
  const revision = observation(port, input.access.owner)
  const last = cursorKey(input, revision)
  if (last === false) return { kind: 'changed' }
  const relation = pageRelation(input)
  const table = input.kind === 'list' ? 'sc_schedules' : 'sc_revisions'
  const key = input.kind === 'list' ? 'schedule_id' : 'revision'
  const where =
    input.kind === 'list'
      ? relation.sql
      : `owner = ? AND schedule_id IN (SELECT schedule_id FROM sc_schedules WHERE ${relation.sql})`
  const params =
    input.kind === 'list' ? relation.params : [canonical(input.access.owner), ...relation.params]
  const count = port.execute(`SELECT count(*) FROM ${table} WHERE ${where} LIMIT 1`, params)
    .rows[0]?.[0]
  if (typeof count !== 'bigint' || count < 0n || count > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error('Invalid exact total')
  const rows = port.execute(
    `SELECT ${key}, record FROM ${table} WHERE ${where}${last === null ? '' : ` AND ${key} > ?`} ORDER BY ${key} ASC LIMIT ?`,
    [...params, ...(last === null ? [] : [last]), input.request.limit + 1],
  ).rows
  const visible = rows.slice(0, input.request.limit)
  const items = visible.map(row => {
    const stored: unknown = JSON.parse(z.string().parse(row[1]))
    if (input.kind === 'list') {
      const record = recordSchema.parse(stored)
      if (!equal(record.view.owner, input.access.owner) || record.view.scheduleId !== row[0])
        throw new Error('Stored schedule binding mismatch')
      return record.view
    }
    const revision = revisionSchema.parse(stored)
    if (
      revision.view.scheduleId !== input.request.scheduleId ||
      BigInt(revision.revision) !== row[0]
    )
      throw new Error('Stored revision binding mismatch')
    return revision.view
  })
  const lastRow = visible.at(-1)
  const lastKey = lastRow?.[0]
  const next =
    rows.length > input.request.limit && lastKey !== undefined
      ? nextCursor(
          input,
          revision,
          typeof lastKey === 'bigint' ? Number(lastKey) : z.string().parse(lastKey),
        )
      : null
  return {
    kind: 'ok',
    value: {
      items,
      nextCursor: next,
      observationRevision: revision,
      complete: true,
      total: { kind: 'exact', value: Number(count) },
    },
  }
}
function read(input: RepositoryRequest, port: ReadPort) {
  const owner =
    input.kind === 'schedule'
      ? input.owner
      : input.kind === 'operation'
        ? input.recovery.owner
        : input.access.owner
  if (!ownerMatches(input.scope, owner)) return { kind: 'absent' }
  switch (input.kind) {
    case 'schedule': {
      const value = readRecord(port, input.owner, input.scheduleId)
      return value === null
        ? { kind: 'absent' }
        : { kind: 'ok', value: { observationRevision: observation(port, owner), value } }
    }
    case 'get':
      return get(input, port)
    case 'list':
    case 'revisions':
      return page(input, port)
    case 'operation': {
      const row = port.execute(
        'SELECT binding FROM sc_operations WHERE operation_ref = ? AND recovery_scope = ? LIMIT 1',
        [input.operationRef, canonical(input.recovery)],
      ).rows[0]
      if (row === undefined) return { kind: 'absent' }
      const binding = bindingSchema.parse(JSON.parse(z.string().parse(row[0])))
      if (
        binding.operation.operationRef !== input.operationRef ||
        !equal(binding.operation.scope, input.recovery) ||
        !equal(binding.scope, input.scope)
      )
        throw new Error('Stored operation binding mismatch')
      return { kind: 'ok', value: binding }
    }
  }
}
export default {
  handler: HANDLER,
  protocol: PROTOCOL,
  read(input, port) {
    try {
      return { kind: 'read', output: json(read(readRequestSchema.parse(input), port)) }
    } catch {
      return { kind: 'failed', diagnostic: 'schedule_repository_invalid_input_or_stored_data' }
    }
  },
} satisfies ReadHandlerModule
