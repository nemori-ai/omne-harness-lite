import { randomUUID } from 'node:crypto'
import type { SqlStorage } from '@omne-harness/sql-contract'
import { json } from './encoding.ts'
import {
  SOURCE_SNAPSHOT_READ,
  sourceObservationSchema,
  type SourceObservation,
  type SourceReference,
} from './source-retention-schema.ts'

export type SettingsSourceReading = SourceObservation | Readonly<{ kind: 'unreadable' }>

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
