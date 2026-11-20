import { z } from 'zod'
import type { CalendarDispositionCommand } from '@omne-harness/calendar'
import type { JsonValue } from '@omne-harness/sql-contract'
import type { ReadPort, SqlCell, SqlValue } from '@omne-harness/sql-contract/worker'
import { canonical, digest } from './encoding.ts'

const CURRENT_VERSION =
  'SELECT s.snapshot, v.version_info FROM ca_current c JOIN ca_versions v ON v.calendar_id = c.calendar_id AND v.version_id = c.version_id LEFT JOIN ca_snapshots s ON s.digest = v.snapshot_digest WHERE c.calendar_id = ? LIMIT 1'
const PINNED_VERSION =
  'SELECT s.snapshot, v.version_info FROM ca_versions v LEFT JOIN ca_snapshots s ON s.digest = v.snapshot_digest WHERE v.calendar_id = ? AND v.version_id = ? LIMIT 1'

const members = z.record(z.string(), z.json())
const generationSchema = z.object({ publicationGeneration: z.int().positive() })

export type StoredSnapshot = Readonly<{ digest: SqlCell | undefined; text: SqlCell | undefined }>

export function saveSnapshot(port: ReadPort, snapshot: JsonValue): string {
  const key = digest(snapshot)
  port.execute('INSERT OR IGNORE INTO ca_snapshots(digest, snapshot) VALUES (?, ?)', [
    key,
    canonical(snapshot),
  ])
  return key
}

export function storedCommand(command: CalendarDispositionCommand): string {
  const { snapshot } = command.candidate
  return canonical({
    ...command,
    candidate: { ...command.candidate, snapshot: snapshot === null ? null : digest(snapshot) },
    disposition:
      command.disposition.kind === 'publish'
        ? { kind: 'publish', snapshot: digest(command.disposition.snapshot) }
        : command.disposition,
  })
}

function resolved(reference: JsonValue | undefined, snapshot: StoredSnapshot): JsonValue {
  if (reference === null) return null
  if (
    typeof reference !== 'string' ||
    reference !== snapshot.digest ||
    typeof snapshot.text !== 'string'
  )
    throw new Error('A stored calendar command names a snapshot that is not stored')
  return members.parse(JSON.parse(snapshot.text))
}

export function fullCommand(stored: SqlCell | undefined, snapshot: StoredSnapshot): JsonValue {
  const command = members.parse(JSON.parse(z.string().parse(stored)))
  const candidate = members.parse(command['candidate'])
  const disposition = members.parse(command['disposition'])
  return {
    ...command,
    candidate: { ...candidate, snapshot: resolved(candidate['snapshot'], snapshot) },
    disposition:
      'snapshot' in disposition
        ? { ...disposition, snapshot: resolved(disposition['snapshot'], snapshot) }
        : disposition,
  }
}

export function readVersion(
  port: ReadPort,
  calendarId: string,
  version: Readonly<{ kind: 'current' }> | Readonly<{ kind: 'pinned'; versionId: string }>,
): JsonValue | null {
  const params: SqlValue[] =
    version.kind === 'current' ? [calendarId] : [calendarId, version.versionId]
  const row = port.execute(version.kind === 'current' ? CURRENT_VERSION : PINNED_VERSION, params)
    .rows[0]
  if (row === undefined) return null
  const [snapshot, info] = row
  if (typeof snapshot !== 'string')
    throw new Error('A calendar version names a snapshot that is not stored')
  const { publicationGeneration } = generationSchema.parse(JSON.parse(z.string().parse(info)))
  return z
    .json()
    .parse(JSON.parse(canonical({ ...members.parse(JSON.parse(snapshot)), publicationGeneration })))
}
