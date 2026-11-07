import type { ParticipantPort } from '@omne-harness/sql-contract/worker'
import {
  StandalonePublicationRefSchema,
  type StandalonePublicationRef,
} from './standalone-publication.ts'
export function readPublication(
  port: ParticipantPort,
  targetKey: string,
): StandalonePublicationRef | null {
  const row = port.execute(
    'SELECT publisher_ref, definition_id, publication_version FROM st_target_publication WHERE target_key = ? LIMIT 1',
    [targetKey],
  ).rows[0]
  return row
    ? StandalonePublicationRefSchema.parse({
        publisherRef: row[0],
        definitionId: row[1],
        version: row[2],
      })
    : null
}
export function writePublication(
  port: ParticipantPort,
  targetKey: string,
  ref: StandalonePublicationRef | null,
): void {
  if (ref === null) {
    port.execute('DELETE FROM st_target_publication WHERE target_key = ?', [targetKey])
    return
  }
  port.execute(
    'INSERT INTO st_target_publication (target_key, publisher_ref, definition_id, publication_version) VALUES (?, ?, ?, ?) ON CONFLICT(target_key) DO UPDATE SET publisher_ref=excluded.publisher_ref, definition_id=excluded.definition_id, publication_version=excluded.publication_version',
    [targetKey, ref.publisherRef, ref.definitionId, ref.version],
  )
}
