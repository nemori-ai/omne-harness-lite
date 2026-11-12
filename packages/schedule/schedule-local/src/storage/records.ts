import {
  createScheduleRecordRef,
  type ManagementDecision,
  type ScheduleRecord,
} from '@omne-harness/schedule'
import type { ScheduleId, ScheduleOwner } from '@omne-harness/schedule-contract'
import type { ParticipantPort, ReadPort } from '@omne-harness/sql-contract/worker'
import { canonical, equal } from './encoding.ts'
import { recordSchema, revisionSchema } from './schema.ts'

export function readRecord(
  port: ReadPort,
  owner: ScheduleOwner,
  scheduleId: ScheduleId,
): ScheduleRecord | null {
  const row = port.execute(
    'SELECT record FROM sc_schedules WHERE owner = ? AND schedule_id = ? LIMIT 1',
    [canonical(owner), scheduleId],
  ).rows[0]
  if (row === undefined) return null
  if (typeof row[0] !== 'string') throw new Error('Invalid stored schedule')
  const record = recordSchema.parse(JSON.parse(row[0]))
  if (!equal(record.view.owner, owner) || record.view.scheduleId !== scheduleId)
    throw new Error('Stored schedule binding mismatch')
  return record
}
function saveRecord(port: ParticipantPort, value: ScheduleRecord) {
  const record = recordSchema.parse(value)
  const { view } = record
  const owner = canonical(view.owner)
  const purpose = view.definition.purpose
  const device =
    purpose.kind === 'execution' && purpose.scope.kind === 'device' ? purpose.scope.deviceRef : null
  port.execute(
    'INSERT INTO sc_schedules (owner, schedule_id, author, agent_ref, control, standing, created_by, device_ref, calendar_id, purpose, record) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(owner, schedule_id) DO UPDATE SET author=excluded.author, agent_ref=excluded.agent_ref, control=excluded.control, standing=excluded.standing, created_by=excluded.created_by, device_ref=excluded.device_ref, calendar_id=excluded.calendar_id, purpose=excluded.purpose, record=excluded.record',
    [
      owner,
      view.scheduleId,
      canonical(view.author),
      view.author.kind === 'agent' ? view.author.actorRef : null,
      view.control,
      view.standing.kind,
      view.createdBy,
      device,
      view.definition.binding.kind === 'explicit'
        ? (view.definition.binding.calendar?.calendarId ?? null)
        : (record.adoptedBasis?.calendarId ?? null),
      purpose.kind,
      canonical(record),
    ],
  )
  const definition = canonical(view.definition)
  port.execute(
    'INSERT INTO sc_definitions (owner, schedule_id, revision, definition_ref, definition) VALUES (?, ?, ?, ?, ?) ON CONFLICT(owner, schedule_id, revision) DO NOTHING',
    [owner, view.scheduleId, view.definitionRevision, record.definitionRef, definition],
  )
  const saved = port.execute(
    'SELECT definition_ref, definition FROM sc_definitions WHERE owner = ? AND schedule_id = ? AND revision = ? LIMIT 1',
    [owner, view.scheduleId, view.definitionRevision],
  ).rows[0]
  if (saved?.[0] !== record.definitionRef || saved[1] !== definition)
    throw new Error('Immutable definition conflict')
}
export function saveDecision(
  port: ParticipantPort,
  decision: Extract<ManagementDecision, { kind: 'save' }>,
) {
  const { mutation } = decision
  if (mutation.kind === 'noChange') return
  const records =
    mutation.kind === 'replace' ? [mutation.predecessor, mutation.successor] : [mutation.next]
  for (const record of records) saveRecord(port, record)
  const owner = canonical(decision.result.owner)
  for (const value of decision.revisions) {
    const revision = revisionSchema.parse(value)
    if (
      revision.afterRecordRef !==
      createScheduleRecordRef({
        owner: decision.result.owner,
        scheduleId: revision.view.scheduleId,
        revision: revision.revision,
      })
    )
      throw new Error('Revision reference mismatch')
    port.execute(
      'INSERT INTO sc_revisions (owner, schedule_id, revision, record) VALUES (?, ?, ?, ?)',
      [owner, revision.view.scheduleId, revision.revision, canonical(revision)],
    )
  }
  for (const event of decision.events)
    port.execute(
      'INSERT INTO sc_outbox (owner, operation_ref, schedule_id, revision, event) VALUES (?, ?, ?, ?, ?)',
      [owner, event.operationRef, event.scheduleId, event.revision, canonical(event)],
    )
  port.execute(
    'INSERT INTO sc_observations (owner, revision) VALUES (?, 1) ON CONFLICT(owner) DO UPDATE SET revision=revision+1',
    [owner],
  )
}
