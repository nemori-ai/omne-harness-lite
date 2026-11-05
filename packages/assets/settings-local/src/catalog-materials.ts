import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { SqlMaterialCatalog } from '@omne-harness/sql-contract'
import { GUARD_FACT } from './schema.ts'
import { settingsStandaloneProjectionFact, settingsAssetsProjectionFact } from './projection.ts'
import { TERMINAL_FACT } from './terminal-schema.ts'
import { TARGET_GUARD, TARGET_GUARD_PROTOCOL } from './target-guard.ts'
import { SNAPSHOT_PARTICIPANT, SNAPSHOT_PROTOCOL } from './snapshot-schema.ts'
export function settingsCatalogMaterials(): Pick<
  SqlMaterialCatalog,
  'participants' | 'migrations' | 'readHandlers'
> {
  const file = (name: string) => {
    const url = new URL(
      `./${name}.${import.meta.url.endsWith('.ts') ? 'ts' : 'js'}`,
      import.meta.url,
    )
    return {
      moduleUrl: url.href,
      codeDigest: createHash('sha256').update(readFileSync(url)).digest('hex'),
    }
  }
  const sources = [settingsStandaloneProjectionFact, settingsAssetsProjectionFact]
  return {
    participants: [
      {
        participant: TARGET_GUARD,
        protocol: TARGET_GUARD_PROTOCOL,
        ...file('target-guard'),
        ownedTables: [],
        readTables: [],
        requiresFacts: sources,
        providesFacts: [GUARD_FACT],
        allowedFunctions: [],
        grouping: 'groupable',
      },
      {
        participant: SNAPSHOT_PARTICIPANT,
        protocol: SNAPSHOT_PROTOCOL,
        ...file('snapshot-participant'),
        ownedTables: [],
        readTables: ['st_states'],
        requiresFacts: [...sources, TERMINAL_FACT],
        providesFacts: [],
        allowedFunctions: [],
        grouping: 'groupable',
      },
    ],
    migrations: [],
    readHandlers: [],
  }
}
