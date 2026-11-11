import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { SqlMaterialCatalog } from '@omne-harness/sql-contract'
import {
  SOURCE_READINESS_FACT,
  SOURCE_READINESS_PARTICIPANT,
  SOURCE_READINESS_PROTOCOL,
} from './source-readiness.ts'
import { SOURCE_RETENTION_TABLES } from './source-retention-schema.ts'
export function sourceReadinessMaterials(): Pick<
  SqlMaterialCatalog,
  'participants' | 'migrations' | 'readHandlers'
> {
  const url = new URL(
    `./source-readiness.${import.meta.url.endsWith('.ts') ? 'ts' : 'js'}`,
    import.meta.url,
  )
  return {
    participants: [
      {
        participant: SOURCE_READINESS_PARTICIPANT,
        protocol: SOURCE_READINESS_PROTOCOL,
        moduleUrl: url.href,
        codeDigest: createHash('sha256').update(readFileSync(url)).digest('hex'),
        ownedTables: [],
        readTables: SOURCE_RETENTION_TABLES,
        requiresFacts: [],
        providesFacts: [SOURCE_READINESS_FACT],
        allowedFunctions: [],
        grouping: 'groupable',
      },
    ],
    migrations: [],
    readHandlers: [],
  }
}
