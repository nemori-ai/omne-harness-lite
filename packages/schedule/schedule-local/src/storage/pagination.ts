import { z } from 'zod'
import type { ReadAccess } from '@omne-harness/schedule'
import type { SqlValue } from '@omne-harness/sql-contract/worker'
import { ScheduleIdSchema } from '@omne-harness/schedule-contract'
import { canonical, digest } from './encoding.ts'
import type { PageRequest } from './read-schema.ts'
const cursorSchema = z.strictObject({
  version: z.literal('schedule-management-cursor/1'),
  binding: z.string().regex(/^[0-9a-f]{64}$/),
  observationRevision: z.string().regex(/^(0|[1-9][0-9]*)$/),
  last: z.union([ScheduleIdSchema, z.int().positive()]),
})
export type Relation = { sql: string; params: SqlValue[] }
export function visibleRelation(access: ReadAccess): Relation {
  const relation: Relation = { sql: 'owner = ?', params: [canonical(access.owner)] }
  if (access.visibility.kind === 'ownerAll') return relation
  const ids = access.visibility.scheduleIds
  if (ids.length === 0) {
    relation.sql += ' AND 0 = 1'
    return relation
  }
  relation.sql += ` AND schedule_id IN (${ids.map(() => '?').join(', ')})`
  relation.params.push(...ids)
  if (access.visibility.kind === 'authoredIds') {
    relation.sql += ' AND author = ?'
    relation.params.push(canonical(access.visibility.author))
  }
  return relation
}
export function pageRelation(input: PageRequest): Relation {
  const relation = visibleRelation(input.access)
  if (input.kind === 'revisions') {
    relation.sql += ' AND schedule_id = ?'
    relation.params.push(input.request.scheduleId)
    return relation
  }
  const filters = [
    [input.request.agentRef, 'agent_ref'],
    [input.request.control, 'control'],
    [input.request.standing, 'standing'],
    [input.request.createdBy, 'created_by'],
    [input.request.targetDeviceRef, 'device_ref'],
    [input.request.calendarId, 'calendar_id'],
    [input.request.purpose, 'purpose'],
  ] as const
  for (const [value, column] of filters) {
    if (value !== null) {
      relation.sql += ` AND ${column} = ?`
      relation.params.push(value)
    }
  }
  return relation
}
function pageBinding(input: PageRequest) {
  const { cursor: _cursor, limit: _limit, ...filter } = input.request
  return digest([input.kind, input.scope, input.access, filter])
}
export function cursorKey(
  input: PageRequest,
  observationRevision: string,
): string | number | null | false {
  const cursor = input.request.cursor
  if (cursor === null) return null
  try {
    const bytes = Buffer.from(cursor, 'base64url')
    if (bytes.toString('base64url') !== cursor) return false
    const parsed = cursorSchema.parse(JSON.parse(bytes.toString('utf8')))
    if (
      parsed.binding !== pageBinding(input) ||
      parsed.observationRevision !== observationRevision ||
      (input.kind === 'list' ? typeof parsed.last !== 'string' : typeof parsed.last !== 'number')
    )
      return false
    return parsed.last
  } catch {
    return false
  }
}
export function nextCursor(input: PageRequest, observationRevision: string, last: string | number) {
  return Buffer.from(
    canonical(
      cursorSchema.parse({
        version: 'schedule-management-cursor/1',
        binding: pageBinding(input),
        observationRevision,
        last,
      }),
    ),
  ).toString('base64url')
}
