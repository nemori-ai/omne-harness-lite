import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { SqlMaterialCatalog } from '@omne-harness/sql-contract'
import {
  SOURCE_SNAPSHOT_FACT,
  SOURCE_SNAPSHOT_PARTICIPANT,
  SOURCE_SNAPSHOT_PROTOCOL,
} from './source-snapshot.ts'

export function sourceSnapshotMaterials(): Pick<
  SqlMaterialCatalog,
  'participants' | 'migrations' | 'readHandlers'
> {
  const url = new URL(
    `./source-snapshot.${import.meta.url.endsWith('.ts') ? 'ts' : 'js'}`,
    import.meta.url,
  )
  return {
    participants: [
      {
        participant: SOURCE_SNAPSHOT_PARTICIPANT,
        protocol: SOURCE_SNAPSHOT_PROTOCOL,
        moduleUrl: url.href,
        codeDigest: createHash('sha256').update(readFileSync(url)).digest('hex'),
        ownedTables: [],
        readTables: ['st_targets', 'st_states'],
        requiresFacts: [],
        providesFacts: [SOURCE_SNAPSHOT_FACT],
        allowedFunctions: [],
        grouping: 'groupable',
      },
    ],
    migrations: [],
    readHandlers: [],
  }
}
