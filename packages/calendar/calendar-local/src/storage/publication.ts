import { calendarSnapshotSchema, type CalendarSnapshot } from '@omne-harness/calendar-contract'
import type { CalendarDispositionCommand, CalendarPublicationReceipt } from '@omne-harness/calendar'
import type { ParticipantPort } from '@omne-harness/sql-contract/worker'
import { canonical, digest } from './encoding.ts'
import { record } from './records.ts'
import { directorySchema } from './schema.ts'

type ProposedSnapshot = Omit<CalendarSnapshot, 'publicationGeneration'>
type PublicationDecision =
  | Readonly<{ kind: 'publish' | 'noChange' }>
  | Readonly<{
      kind: 'conflict'
      reason: 'invalid' | 'versionConflict' | 'contentHashConflict' | 'staleSeed'
    }>
function content(snapshot: ProposedSnapshot) {
  return {
    calendarId: snapshot.calendarId,
    coverageStart: snapshot.coverageStart,
    coverageEnd: snapshot.coverageEnd,
    timezone: snapshot.timezone,
    weeklyDefault: snapshot.weeklyDefault,
    overrides: snapshot.overrides,
  }
}
function conflictsWithVersion(existing: CalendarSnapshot | null, proposed: ProposedSnapshot) {
  if (existing === null) return false
  const { publicationGeneration: _generation, ...original } = existing
  return canonical(original) !== canonical(proposed)
}
function staleSeed(
  command: CalendarDispositionCommand,
  proposed: ProposedSnapshot,
  current: CalendarSnapshot | null,
) {
  return (
    command.address.operation === 'importSeed' &&
    current !== null &&
    (proposed.knowledgeAsOf < current.knowledgeAsOf ||
      proposed.coverageStart > current.coverageStart ||
      proposed.coverageEnd < current.coverageEnd)
  )
}
export function publicationDecision(
  command: CalendarDispositionCommand,
  proposed: ProposedSnapshot,
  current: CalendarSnapshot | null,
  port: ParticipantPort,
): PublicationDecision {
  if (canonical(command.candidate.snapshot) !== canonical(proposed))
    return { kind: 'conflict', reason: 'invalid' }
  const existing = record(
    port.execute('SELECT snapshot FROM ca_versions WHERE calendar_id = ? AND version_id = ?', [
      proposed.calendarId,
      proposed.versionId,
    ]),
    calendarSnapshotSchema,
  )
  if (conflictsWithVersion(existing, proposed))
    return { kind: 'conflict', reason: 'versionConflict' }
  if (current?.contentHash === proposed.contentHash) {
    return canonical(content(current)) === canonical(content(proposed))
      ? { kind: 'noChange' }
      : { kind: 'conflict', reason: 'contentHashConflict' }
  }
  if (existing !== null) return { kind: 'conflict', reason: 'versionConflict' }
  if (staleSeed(command, proposed, current)) return { kind: 'conflict', reason: 'staleSeed' }
  return { kind: 'publish' }
}
export function savePublication(
  command: CalendarDispositionCommand,
  proposed: ProposedSnapshot,
  receipt: CalendarPublicationReceipt,
  port: ParticipantPort,
): CalendarPublicationReceipt {
  const snapshot = { ...proposed, publicationGeneration: command.expectedGeneration + 1 }
  const {
    weeklyDefault: _week,
    overrides: _overrides,
    timezone: _timezone,
    ...versionInfo
  } = snapshot
  port.execute(
    'INSERT INTO ca_versions(calendar_id, version_id, snapshot, version_info, operation_ref) VALUES (?, ?, ?, ?, ?)',
    [
      snapshot.calendarId,
      snapshot.versionId,
      canonical(snapshot),
      canonical(versionInfo),
      receipt.operationRef,
    ],
  )
  const next = {
    versionId: snapshot.versionId,
    publicationGeneration: snapshot.publicationGeneration,
  }
  const directory = directorySchema.parse({
    calendarId: snapshot.calendarId,
    semanticBoundary: command.candidate.semanticBoundary,
    timezone: snapshot.timezone,
    current: next,
  })
  port.execute(
    'INSERT INTO ca_current(calendar_id, version_id, generation, directory) VALUES (?, ?, ?, ?) ON CONFLICT(calendar_id) DO UPDATE SET version_id = excluded.version_id, generation = excluded.generation, directory = excluded.directory',
    [snapshot.calendarId, snapshot.versionId, snapshot.publicationGeneration, canonical(directory)],
  )
  const outboxId = `calendar-reaction:${digest(command.address)}`
  const reaction = {
    id: outboxId,
    operationRef: receipt.operationRef,
    calendarId: snapshot.calendarId,
    ...next,
  }
  port.execute(
    'INSERT INTO ca_outbox(id, operation_ref, system_scope_ref, record) VALUES (?, ?, ?, ?)',
    [outboxId, receipt.operationRef, command.address.systemScopeRef, canonical(reaction)],
  )
  return { ...receipt, current: next, outboxId }
}
