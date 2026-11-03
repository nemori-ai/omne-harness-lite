import { z } from 'zod'
import {
  calendarProbeInputSchema,
  calendarSourceStandingSchema,
} from '@omne-harness/calendar-contract'
import type { ReadHandlerModule, ReadPort } from '@omne-harness/sql-contract/worker'
import type { JsonValue } from '@omne-harness/sql-contract'
import {
  HANDLER,
  PROTOCOL,
  PAGE_LIMIT,
  readSchema,
  runSchema,
  storedSchema,
  type Read,
} from './schema.ts'
import { count, record, records } from './records.ts'

function health(input: Extract<Read, { kind: 'health' }>, port: ReadPort): JsonValue {
  const params = [input.systemScopeRef, input.calendarId]
  const pendingRuns = records(
    port,
    'SELECT record FROM ca_supply_runs WHERE scope = ? AND calendar = ? AND completion IS NULL ORDER BY sequence LIMIT ?',
    [...params, PAGE_LIMIT + 1],
    runSchema,
  )
  const sources = records(
    port,
    'SELECT standing FROM ca_supply_sources WHERE scope = ? AND calendar = ? ORDER BY source LIMIT ?',
    [...params, PAGE_LIMIT + 1],
    calendarSourceStandingSchema,
  )
  if (pendingRuns.length > PAGE_LIMIT || sources.length > PAGE_LIMIT)
    return { kind: 'capacity', reason: 'healthCapacityExceeded' }
  const success = port.execute(
    "SELECT sequence, completed_at FROM ca_supply_runs WHERE scope = ? AND calendar = ? AND outcome IN ('published','noChange') ORDER BY sequence DESC LIMIT 1",
    params,
  ).rows[0]
  const failures = port.execute(
    "SELECT count(*) FROM ca_supply_runs WHERE scope = ? AND calendar = ? AND sequence > ? AND outcome IN ('withheld','rejected') LIMIT 1",
    [...params, success?.[0] ?? 0],
  ).rows[0]
  return {
    pendingRuns,
    sources,
    consecutiveFailures: count(failures?.[0]),
    lastSuccess: success === undefined ? null : z.string().parse(success[1]),
  }
}
function read(input: Read, port: ReadPort): JsonValue {
  switch (input.kind) {
    case 'health':
      return health(input, port)
    case 'material':
      return record(
        port,
        'SELECT record FROM ca_supply_materials WHERE scope = ? AND reference = ?',
        [input.systemScopeRef, input.reference],
        storedSchema,
      )
    case 'pending':
      return records(
        port,
        'SELECT record FROM ca_supply_runs WHERE scope = ? AND completion IS NULL ORDER BY sequence LIMIT ?',
        [input.systemScopeRef, input.limit],
        runSchema,
      )
    case 'due':
      return records(
        port,
        'SELECT due_input FROM ca_supply_sources WHERE scope = ? AND next_due <= ? ORDER BY next_due, calendar, source LIMIT ?',
        [input.systemScopeRef, input.at, input.limit],
        calendarProbeInputSchema,
      )
  }
}
export default {
  handler: HANDLER,
  protocol: PROTOCOL,
  read(input, port) {
    return { kind: 'read', output: read(readSchema.parse(input), port) }
  },
} satisfies ReadHandlerModule
