import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { SqlMaterialCatalog } from '@omne-harness/sql-contract'
import { MIGRATION } from './schema.ts'
import { SOURCE_SNAPSHOT_READ } from './source-retention-schema.ts'
import {
  SOURCE_SNAPSHOT_FACT,
  SOURCE_SNAPSHOT_PARTICIPANT,
  SOURCE_SNAPSHOT_PROTOCOL,
} from './source-snapshot.ts'
import { STANDALONE_MIGRATION } from './standalone-schema.ts'

const file = (name: string) =>
  new URL(`./${name}.${import.meta.url.endsWith('.ts') ? 'ts' : 'js'}`, import.meta.url)
const digestOf = (url: URL) => createHash('sha256').update(readFileSync(url)).digest('hex')

export function sourceSnapshotMaterials(): Pick<
  SqlMaterialCatalog,
  'participants' | 'migrations' | 'readHandlers'
> {
  const url = file('source-snapshot')
  const reader = file('source-snapshot-read')
  return {
    participants: [
      {
        participant: SOURCE_SNAPSHOT_PARTICIPANT,
        protocol: SOURCE_SNAPSHOT_PROTOCOL,
        moduleUrl: url.href,
        codeDigest: digestOf(url),
        ownedTables: [],
        readTables: ['st_targets', 'st_states'],
        requiresFacts: [],
        providesFacts: [SOURCE_SNAPSHOT_FACT],
        allowedFunctions: [],
        grouping: 'groupable',
      },
    ],
    migrations: [],
    readHandlers: [
      {
        ...SOURCE_SNAPSHOT_READ,
        moduleUrl: reader.href,
        codeDigest: digestOf(reader),
        ordering: 'snapshot',
        readTables: ['st_targets', 'st_states'],
        requiresMigrations: [STANDALONE_MIGRATION, MIGRATION],
        maxRowsRead: 2,
        maxOutputBytes: 2 * 1024 * 1024,
      },
    ],
  }
}
