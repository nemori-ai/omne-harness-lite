import type { z } from 'zod'
import type { CalendarSettledRun } from '@omne-harness/calendar'
import type { ParticipantPort } from '@omne-harness/sql-contract/worker'
import { settledCommand } from '../storage/snapshots.ts'
import { canonical, operationRef } from './encoding.ts'
import { record } from './records.ts'
import { completionSchema, storedRunSchema, type Write } from './schema.ts'

type StoredRun = z.infer<typeof storedRunSchema>

const RUN = 'SELECT record FROM ca_supply_runs WHERE scope = ? AND operation_ref = ?'

export function settledRun(run: StoredRun): CalendarSettledRun {
  return { ...run, command: settledCommand(run.command) }
}

export function prepare(input: Extract<Write, { action: 'run.prepare' }>, port: ParticipantPort) {
  const run = input.payload,
    ref = operationRef(run.command.address)
  const previous = record(port, RUN, [input.systemScopeRef, ref], storedRunSchema)
  if (previous !== null)
    return previous.command.expectedFingerprint === run.command.expectedFingerprint
      ? ({ kind: 'ok', value: settledRun(previous) } as const)
      : ({ kind: 'conflict', reason: 'fingerprintMismatch' } as const)
  port.execute(
    'INSERT INTO ca_supply_runs(scope,calendar,operation_ref,fingerprint,record) VALUES (?,?,?,?,?)',
    [
      input.systemScopeRef,
      run.command.address.calendarId,
      ref,
      run.command.expectedFingerprint,
      canonical(run),
    ],
  )
  return { kind: 'ok', value: settledRun(run) } as const
}
export function complete(input: Extract<Write, { action: 'run.complete' }>, port: ParticipantPort) {
  const payload = input.payload
  if (payload.operationRef !== operationRef(payload.address))
    return { kind: 'conflict', reason: 'operationMismatch' } as const
  const run = record(port, RUN, [input.systemScopeRef, payload.operationRef], storedRunSchema)
  if (run === null) return { kind: 'conflict', reason: 'runMissing' } as const
  if (run.command.expectedFingerprint !== payload.expectedFingerprint)
    return { kind: 'conflict', reason: 'fingerprintMismatch' } as const
  const disposition = run.command.disposition.kind
  const compatible =
    disposition === 'publish'
      ? payload.disposition === 'published' || payload.disposition === 'noChange'
      : payload.disposition === disposition
  if (!compatible) return { kind: 'conflict', reason: 'dispositionMismatch' } as const
  const previous = record(
    port,
    'SELECT completion FROM ca_supply_runs WHERE scope = ? AND operation_ref = ? AND completion IS NOT NULL',
    [input.systemScopeRef, payload.operationRef],
    completionSchema,
  )
  if (previous !== null)
    return previous.disposition === payload.disposition
      ? ({ kind: 'ok', value: null } as const)
      : ({ kind: 'conflict', reason: 'completionMismatch' } as const)
  port.execute(
    'UPDATE ca_supply_runs SET record = ?, completion = ?, outcome = ?, completed_at = ? WHERE scope = ? AND operation_ref = ? AND completion IS NULL',
    [
      canonical(settledRun(run)),
      canonical(payload),
      payload.disposition,
      payload.completedAt,
      input.systemScopeRef,
      payload.operationRef,
    ],
  )
  return { kind: 'ok', value: null } as const
}
