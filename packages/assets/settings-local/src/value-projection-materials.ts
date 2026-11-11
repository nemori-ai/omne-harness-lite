import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { SqlMaterialCatalog } from '@omne-harness/sql-contract'
import { settingsAssetsProjectionFact, settingsStandaloneProjectionFact } from './projection.ts'
import { SETTINGS_VALUE_PROJECTION, settingsValueProjectionFact } from './value-projection.ts'

export function settingsValueProjectionMaterials(): SqlMaterialCatalog['participants'] {
  const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js'
  const url = new URL(`./value-projection-participant.${extension}`, import.meta.url)
  return [
    {
      ...SETTINGS_VALUE_PROJECTION,
      moduleUrl: url.href,
      codeDigest: createHash('sha256').update(readFileSync(url)).digest('hex'),
      ownedTables: [],
      readTables: ['st_states'],
      requiresFacts: [settingsAssetsProjectionFact, settingsStandaloneProjectionFact],
      providesFacts: [settingsValueProjectionFact],
      allowedFunctions: [],
      grouping: 'groupable',
    },
  ]
}
