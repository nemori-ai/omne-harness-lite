import { calendarSourceStandingSchema } from '@omne-harness/calendar-contract'
import type { ParticipantPort } from '@omne-harness/sql-contract/worker'
import { canonical, digest } from './encoding.ts'
import { record } from './records.ts'
import type { Write } from './schema.ts'

export function probe(input: Extract<Write, { action: 'probe.record' }>, port: ParticipantPort) {
  const p = input.payload,
    scope = input.systemScopeRef
  const previous = port.execute(
    'SELECT fingerprint, standing FROM ca_supply_probes WHERE scope = ? AND calendar = ? AND operation_key = ?',
    [scope, p.calendarId, p.operationKey],
  ).rows[0]
  if (previous !== undefined) {
    if (previous[0] !== p.fingerprint)
      return { kind: 'conflict', reason: 'fingerprintMismatch' } as const
    return {
      kind: 'ok',
      value: calendarSourceStandingSchema.parse(JSON.parse(String(previous[1]))),
    } as const
  }
  const old = record(
    port,
    'SELECT standing FROM ca_supply_sources WHERE scope = ? AND calendar = ? AND source = ?',
    [scope, p.calendarId, p.observation.sourceId],
    calendarSourceStandingSchema,
  )
  const failed = p.observation.kind === 'failed'
  const standing = {
    sourceId: p.observation.sourceId,
    observation: p.observation,
    nextDue: p.nextDue,
    consecutiveFailures: failed ? (old?.consecutiveFailures ?? 0) + 1 : 0,
    lastSuccess: failed ? (old?.lastSuccess ?? null) : p.observation.observedAt,
  }
  port.execute(
    'INSERT INTO ca_supply_probes(scope,calendar,operation_key,fingerprint,payload,standing) VALUES (?,?,?,?,?,?)',
    [scope, p.calendarId, p.operationKey, p.fingerprint, canonical(p), canonical(standing)],
  )
  if (old === null || p.observation.observedAt >= old.observation.observedAt) {
    const due = {
      calendarId: p.calendarId,
      policyVersion: p.policyVersion,
      sourceId: standing.sourceId,
      operationKey: `probe:${digest({ scope, payload: p })}`,
    }
    port.execute(
      'INSERT INTO ca_supply_sources(scope,calendar,source,observed_at,next_due,due_input,standing) VALUES (?,?,?,?,?,?,?) ON CONFLICT(scope,calendar,source) DO UPDATE SET observed_at = excluded.observed_at, next_due = excluded.next_due, due_input = excluded.due_input, standing = excluded.standing',
      [
        scope,
        p.calendarId,
        standing.sourceId,
        p.observation.observedAt,
        p.nextDue,
        canonical(due),
        canonical(standing),
      ],
    )
  }
  return { kind: 'ok', value: standing } as const
}
