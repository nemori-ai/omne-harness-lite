import { randomUUID } from 'node:crypto'
import type { SqlStorage } from '@omne-harness/sql-contract'
import { json } from './encoding.ts'
import {
  SOURCE_SNAPSHOT_READ,
  sourceObservationSchema,
  type SourceObservation,
  type SourceReference,
} from './source-retention-schema.ts'

export type SettingsSourceReading =
  | SourceObservation
  /** The storage gave no answer. It is not an absent source and not an empty value. */
  | Readonly<{ kind: 'unreadable' }>

/**
 * Reads the current state of one source in its own domain. The read makes no reservation, so a
 * later change of the source is not prevented: the caller reads again when it needs the value.
 */
export async function readSettingsSource(
  storage: Pick<SqlStorage, 'read'>,
  source: SourceReference,
): Promise<SettingsSourceReading> {
  const read = await storage.read({
    domain: source.domain,
    ...SOURCE_SNAPSHOT_READ,
    requestKey: randomUUID(),
    input: json({ source }),
  })
  if (read.kind !== 'read') return { kind: 'unreadable' }
  const observation = sourceObservationSchema.safeParse(read.output)
  return observation.success ? observation.data : { kind: 'unreadable' }
}
